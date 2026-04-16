import { defineEventHandler } from "h3";

export default defineEventHandler(async () => {
  // Simulate a slow API call
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    message:
      "Data loaded after 1s delay \u2014 streamed into the page via async fetch().",
  };
});
