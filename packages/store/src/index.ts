// @virtual-frame/store — Public API

export { createStore, getStore } from "./store.js";
export { connectPort } from "./port.js";
export { isStoreProxy } from "./proxy.js";

export type {
  Operation,
  OperationType,
  StoreOptions,
  StoreHandle,
  StoreProxy,
} from "./types.js";
