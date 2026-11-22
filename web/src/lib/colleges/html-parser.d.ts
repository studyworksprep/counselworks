declare module "next/dist/compiled/node-html-parser" {
  interface Element {
    structuredText: string;
    text: string;
    remove(): void;
    insertAdjacentHTML(position: "afterbegin", html: string): void;
    querySelectorAll(selector: string): Element[];
  }
  export function parse(html: string): Element;
}
