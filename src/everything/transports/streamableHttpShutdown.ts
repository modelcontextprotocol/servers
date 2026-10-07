type ClosableTransport = {
  close: () => Promise<void>;
};

export async function closeActiveTransports(
  transports: Map<string, ClosableTransport>
): Promise<void> {
  for (const [sessionId, transport] of transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transport.close();
      transports.delete(sessionId);
    } catch (error) {
      console.log(`Error closing transport for session ${sessionId}:`, error);
    }
  }
}
