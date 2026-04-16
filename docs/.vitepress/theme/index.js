import DefaultTheme from "vitepress/theme";
import Footer from "./Footer.vue";
import LandingContent from "./LandingContent.vue";
import { h } from "vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-features-after": () => [h(LandingContent), h(Footer)],
    });
  },
};
