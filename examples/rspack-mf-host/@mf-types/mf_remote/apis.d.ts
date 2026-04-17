export type RemoteKeys = "mf_remote/Counter";
type PackageType<T> = T extends "mf_remote/Counter" ? typeof import("mf_remote/Counter") : any;
