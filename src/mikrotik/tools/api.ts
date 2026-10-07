import net from 'net';
import tls from 'tls';
import crypto from 'crypto';

export type Word = string;
export type Sentence = Word[];
export type ReplyAttributes = { [key: string]: string };
export type Reply = {
    command: string;
    attributes: ReplyAttributes;
};

export class MikroTikApi {
    private socket: net.Socket | null = null;
    private buffer: Buffer = Buffer.alloc(0);
    private resolveRead: ((sentence: Sentence) => void) | null = null;
    private rejectRead: ((err: Error) => void) | null = null;
    private debug: boolean = false;

    constructor(options: { debug?: boolean } = {}) {
        this.debug = !!options.debug;
    }

    async connect(host: string, port?: number, secure: boolean = false): Promise<void> {
        const targetPort = port || (secure ? 8729 : 8728);
        return new Promise((resolve, reject) => {
            const onConnect = () => {
                if (this.debug) console.log(`Connected to ${host}:${targetPort}`);
                resolve();
            };

            const onError = (err: Error) => {
                if (this.debug) console.error('Socket error:', err);
                if (this.rejectRead) {
                    this.rejectRead(err);
                    this.rejectRead = null;
                }
                reject(err);
            };

            if (secure) {
                this.socket = tls.connect(targetPort, host, {
                    rejectUnauthorized: false,
                    // Specific ciphers if needed, like in python example: ciphers="ECDHE-RSA-AES256-GCM-SHA384"
                }, onConnect);
            } else {
                this.socket = net.connect(targetPort, host, onConnect);
            }

            this.socket.on('data', (data) => {
                this.buffer = Buffer.concat([this.buffer, data]);
                this.processBuffer();
            });

            this.socket.on('error', onError);

            this.socket.on('end', () => {
                if (this.debug) console.log('Connection ended');
                if (this.rejectRead) {
                    this.rejectRead(new Error('Connection closed'));
                    this.rejectRead = null;
                }
            });
        });
    }

    private processBuffer() {
        while (this.resolveRead) {
            const sentence = this.readSentenceFromBuffer();
            if (sentence) {
                const resolve = this.resolveRead;
                this.resolveRead = null;
                this.rejectRead = null;
                resolve(sentence);
            } else {
                break;
            }
        }
    }

    private readSentenceFromBuffer(): Sentence | null {
        let offset = 0;
        const words: Sentence = [];

        while (true) {
            const { length, bytesRead } = this.decodeLength(this.buffer.slice(offset));
            if (length === null) return null; // Need more data for length

            offset += bytesRead;
            if (length === 0) {
                this.buffer = this.buffer.slice(offset);
                return words;
            }

            if (this.buffer.length < offset + length) return null; // Need more data for word

            const word = this.buffer.slice(offset, offset + length).toString('utf8');
            words.push(word);
            offset += length;
        }
    }

    private decodeLength(buf: Buffer): { length: number | null; bytesRead: number } {
        if (buf.length === 0) return { length: null, bytesRead: 0 };
        const c = buf[0];
        if ((c & 0x80) === 0x00) {
            return { length: c, bytesRead: 1 };
        } else if ((c & 0xC0) === 0x80) {
            if (buf.length < 2) return { length: null, bytesRead: 0 };
            return { length: ((c & 0x3F) << 8) + buf[1], bytesRead: 2 };
        } else if ((c & 0xE0) === 0xC0) {
            if (buf.length < 3) return { length: null, bytesRead: 0 };
            return { length: ((c & 0x1F) << 16) + (buf[1] << 8) + buf[2], bytesRead: 3 };
        } else if ((c & 0xF0) === 0xE0) {
            if (buf.length < 4) return { length: null, bytesRead: 0 };
            return { length: ((c & 0x0F) << 24) + (buf[1] << 16) + (buf[2] << 8) + buf[3], bytesRead: 4 };
        } else if ((c & 0xF8) === 0xF0) {
            if (buf.length < 5) return { length: null, bytesRead: 0 };
            return { length: (buf[1] << 24) + (buf[2] << 16) + (buf[3] << 8) + buf[4], bytesRead: 5 };
        }
        return { length: null, bytesRead: 0 };
    }

    private encodeLength(len: number): Buffer {
        if (len < 0x80) {
            return Buffer.from([len]);
        } else if (len < 0x4000) {
            return Buffer.from([(len >> 8) | 0x80, len & 0xFF]);
        } else if (len < 0x200000) {
            return Buffer.from([(len >> 16) | 0xC0, (len >> 8) & 0xFF, len & 0xFF]);
        } else if (len < 0x10000000) {
            return Buffer.from([(len >> 24) | 0xE0, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
        } else {
            return Buffer.from([0xF0, (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
        }
    }

    async writeSentence(words: Sentence): Promise<void> {
        if (!this.socket) throw new Error('Not connected');
        for (const word of words) {
            if (this.debug) console.log(`<<< ${word}`);
            const buf = Buffer.from(word, 'utf8');
            this.socket.write(this.encodeLength(buf.length));
            this.socket.write(buf);
        }
        this.socket.write(Buffer.from([0])); // End of sentence
    }

    async readSentence(): Promise<Sentence> {
        if (this.resolveRead) throw new Error('Already waiting for a sentence');
        return new Promise((resolve, reject) => {
            this.resolveRead = (sentence) => {
                if (this.debug) sentence.forEach(w => console.log(`>>> ${w}`));
                resolve(sentence);
            };
            this.rejectRead = reject;
            this.processBuffer();
        });
    }

    async talk(words: Sentence): Promise<Reply[]> {
        await this.writeSentence(words);
        const replies: Reply[] = [];
        while (true) {
            const sentence = await this.readSentence();
            if (sentence.length === 0) continue;
            const reply: Reply = {
                command: sentence[0],
                attributes: {}
            };
            for (let i = 1; i < sentence.length; i++) {
                const word = sentence[i];
                const eqIdx = word.indexOf('=', 1);
                let key: string;
                let value: string;

                if (eqIdx === -1) {
                    key = word;
                    value = '';
                } else {
                    key = word.slice(0, eqIdx);
                    value = word.slice(eqIdx + 1);
                }

                // Strip leading '=' or '.' from key
                if (key.startsWith('=') || key.startsWith('.')) {
                    key = key.slice(1);
                }

                reply.attributes[key] = value;
            }
            replies.push(reply);
            if (reply.command === '!done') return replies;
            if (reply.command === '!trap') {
                // Usually followed by !done, but we should keep reading just in case
                continue;
            }
            if (reply.command === '!fatal') {
                const message = reply.attributes['message'] || 'Fatal error';
                throw new Error(message);
            }
        }
    }

    async login(username: string, password: string): Promise<boolean> {
        const replies = await this.talk(['/login', `=name=${username}`, `=password=${password}`]);

        if (replies.some(r => r.command === '!trap')) return false;

        const lastReply = replies[replies.length - 1];

        if (lastReply.attributes['ret']) {
            // Legacy MD5 login
            const challenge = Buffer.from(lastReply.attributes['ret'], 'hex');
            const md = crypto.createHash('md5');
            md.update(Buffer.from([0]));
            md.update(password);
            md.update(challenge);
            const response = md.digest('hex');

            const replies2 = await this.talk(['/login', `=name=${username}`, `=response=00${response}`]);
            return !replies2.some(r => r.command === '!trap');
        }

        return lastReply.command === '!done';
    }

    close() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }
}
