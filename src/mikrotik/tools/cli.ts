import { MikroTikApi } from './api.js';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log('Usage: node cli.js <host> [user] [pass] [secure]');
        console.log('Example: node cli.js 192.168.88.1 admin password false');
        return;
    }

    const host = args[0];
    const user = args[1] || 'admin';
    const pass = args[2] || '';
    const secure = args[3] === 'true';

    const api = new MikroTikApi({ debug: false });
    try {
        console.log(`Connecting to ${host}...`);
        await api.connect(host, undefined, secure);

        console.log(`Logging in as ${user}...`);
        if (!await api.login(user, pass)) {
            console.error('Login failed');
            api.close();
            return;
        }
        console.log('Login successful');

        const rl = readline.createInterface({ input, output });
        let sentence: string[] = [];

        console.log('Enter command lines (e.g. /system/identity/print), then an empty line to send.');
        while (true) {
            const line = await rl.question('> ');
            if (line === '') {
                if (sentence.length > 0) {
                    try {
                        const replies = await api.talk(sentence);
                        const results = replies
                            .filter(r => r.command === '!re')
                            .map(r => r.attributes);

                        if (results.length > 0) {
                            console.log(JSON.stringify(results, null, 2));
                        }

                        const trap = replies.find(r => r.command === '!trap');
                        if (trap) {
                            console.error('Error (!trap):', JSON.stringify(trap.attributes, null, 2));
                        }

                        const done = replies.find(r => r.command === '!done');
                        if (done && Object.keys(done.attributes).length > 0) {
                            console.log('Info (!done):', JSON.stringify(done.attributes, null, 2));
                        }
                    } catch (err) {
                        const message = (err as Error).message;
                        console.error('Command failed:', message);
                        if (message.includes('connection closed') || message.includes('Connection closed') || message.includes('ended')) {
                            api.close();
                            process.exit(0);
                        }
                    }
                    sentence = [];
                }
            } else {
                sentence.push(line);
            }
        }
    } catch (err) {
        console.error('Connection error:', (err as Error).message);
    }
}

main();
