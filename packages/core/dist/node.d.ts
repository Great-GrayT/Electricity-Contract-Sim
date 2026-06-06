import { Dataset } from "./dataset.js";
/** Load the real GB dataset from an extractor output directory (contains gb.meta.json + gb.f64). */
export declare function loadDatasetNode(dir: string): Promise<Dataset>;
