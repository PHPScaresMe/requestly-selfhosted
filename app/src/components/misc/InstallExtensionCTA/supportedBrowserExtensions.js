import { isSelfHosted } from "utils/EnvUtils";

// In self-host we ship the same unpacked MV3 build as `/extension.zip` from the
// SPA's nginx (see docker/Dockerfile.app). Users download → unzip → load
// unpacked. No Chrome Web Store listing involved. We register an entry per
// browser name so the CTA's `ua-parser-js`-driven detection picks one up
// regardless of which Chromium variant the visitor is using.
const SELF_HOSTED_DOWNLOAD = "/extension.zip";
const SELF_HOSTED_ICON = "https://img.icons8.com/fluent/128/000000/chrome.png";

const selfHostExtensions = ["Chrome", "Edge", "Brave", "Opera", "Vivaldi", "Chromium", "Firefox"].map(
  (name) => ({
    name,
    iconURL: SELF_HOSTED_ICON,
    downloadURL: SELF_HOSTED_DOWNLOAD,
    title: `Self-hosted extension (${name})`,
    alt: `Requestly self-hosted extension build for ${name}`,
  }),
);

const saasExtensions = [
  {
    name: "Chrome",
    iconURL: "https://img.icons8.com/fluent/128/000000/chrome.png",
    downloadURL:
      window.location.hostname === "beta.requestly.io"
        ? "https://chromewebstore.google.com/detail/requestly-http-intercepti/fmpmigcoagdbodbmhnhdbkejjpdfipef"
        : "https://chrome.google.com/webstore/detail/requestly-redirect-url-mo/mdnleldcmiljblolnjhpnblkcekpdkpa",
    title: "Chrome Extension",
    alt: `Requestly for chrome |  proxyman alternatives | mocky.io alternative | Fiddler Alternative | charles proxy alternative`,
  },
  {
    name: "Firefox",
    iconURL: "https://img.icons8.com/color/128/000000/firefox.png",
    downloadURL: "https://app.requestly.in/firefox/builds/requestly-latest.xpi",
    title: "Firefox Extension",
    alt: `Requestly for firefox |  proxyman alternatives | mocky.io alternative | Fiddler Alternative | charles proxy alternative`,
  },
  {
    name: "Edge",
    iconURL: "https://img.icons8.com/color/128/000000/ms-edge-new.png",
    downloadURL:
      "https://microsoftedge.microsoft.com/addons/detail/requestly-redirect-url-/ehghoapnlpepjmfbgaomdiilchcjemak",
    title: "Edge Extension",
    alt: `Requestly for edge |  proxyman alternatives | mocky.io alternative | Fiddler Alternative | charles proxy alternative`,
  },
  {
    name: "Safari",
    iconURL: "https://img.icons8.com/color/128/000000/safari.png",
    downloadURL: "https://apps.apple.com/in/app/requestly-api-dev-toolkit/id6741503024",
    title: "Safari Extension",
    alt: `Requestly for safari |  proxyman alternatives | mocky.io alternative | Fiddler Alternative | charles proxy alternative`,
  },
];

export const supportedBrowserExtensions = isSelfHosted() ? selfHostExtensions : saasExtensions;
