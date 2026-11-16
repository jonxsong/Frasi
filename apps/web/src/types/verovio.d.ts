declare module "verovio/wasm" {
  interface VerovioModule {
    cwrap: (...args: unknown[]) => (...args: unknown[]) => unknown;
  }
  export default function createVerovioModule(): Promise<VerovioModule>;
}

declare module "verovio/esm" {
  import type { VerovioModule } from "verovio/wasm";

  export class VerovioToolkit {
    constructor(module: VerovioModule);
    destroy(): void;
    loadData(data: string): boolean;
    setOptions(options: Record<string, string | number | boolean>): void;
    redoLayout(options?: Record<string, string | number | boolean>): void;
    getPageCount(): number;
    renderToSVG(page: number, xmlDeclaration?: boolean): string;
  }
}
