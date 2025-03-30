/**
 * Declaration file for the mermaid library
 * This is used to provide type information for the mermaid library
 * which is loaded from a CDN in the HTML template
 */

declare namespace mermaid {
  function initialize(config: any): void;
}

declare module 'mermaid' {
  export = mermaid;
}
