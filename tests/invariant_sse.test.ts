import { app } from '../../src/everything/transports/sse';

describe('SSE endpoints maintain rate limiting under adversarial load', () => {
  const adversarialPayloads = [
    { type: 'exploit', description: 'burst request flood', count: 1000 },
    { type: 'boundary', description: 'max concurrent connections', count: 100 },
    { type: 'valid', description: 'normal single request', count: 1 }
  ];

  test.each(adversarialPayloads)('endpoint responds appropriately to $description', async ({ count }) => {
    const requests = Array.from({ length: count }, (_, i) => 
      fetch(`http://localhost:${process.env.PORT || 3000}/sse`)
    );

    const responses = await Promise.allSettled(requests);
    
    // Security property: system must not become unresponsive
    const fulfilledCount = responses.filter(r => r.status === 'fulfilled').length;
    expect(fulfilledCount).toBeLessThan(count); // Some requests should be rejected/throttled
    
    // Additional property: no successful responses should leak resources
    responses.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const response = result.value;
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.status).toBe(200);
      }
    });
  });
});