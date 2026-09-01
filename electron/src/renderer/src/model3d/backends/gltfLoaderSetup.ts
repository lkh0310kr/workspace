import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type * as THREE from "three";

const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}draco/`;
const BASIS_TRANSCODER_PATH = `${import.meta.env.BASE_URL}basis/`;

let dracoLoader: DRACOLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  }
  return dracoLoader;
}

function getKtx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
  }
  ktx2Loader.detectSupport(renderer);
  return ktx2Loader;
}

export function configureGltfLoader(loader: GLTFLoader, renderer?: THREE.WebGLRenderer): void {
  loader.setDRACOLoader(getDracoLoader());
  if (renderer) {
    loader.setKTX2Loader(getKtx2Loader(renderer));
  }
}
