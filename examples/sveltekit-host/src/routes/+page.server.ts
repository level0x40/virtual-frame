import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/sveltekit/server";

const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://localhost:3019";

export const load = async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);

  return {
    fullFrame: await prepareVirtualFrameProps(frame, { proxy: "/__vf" }),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
      proxy: "/__vf",
    }),
  };
};
