import { InjectionToken } from "@angular/core";

export interface FrameProps {
  _vfHtml: string;
  src: string;
  isolate: "open" | "closed";
  selector?: string;
  proxy?: string;
}

export interface FrameData {
  fullFrame: FrameProps;
  counterFrame: FrameProps;
}

/** Provided during SSR with pre-fetched frame content. Null on the client. */
export const FRAME_DATA = new InjectionToken<FrameData>("FRAME_DATA");
