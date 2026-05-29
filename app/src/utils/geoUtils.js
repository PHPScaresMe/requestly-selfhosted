import Logger from "lib/logger";
import { isSelfHosted } from "utils/EnvUtils";

//no of logos for each country for iteration
export const filesByCountry = {
  AU: 3,
  BR: 5,
  CA: 4,
  CN: 3,
  DE: 1,
  GB: 5,
  IN: 6,
  JP: 6,
  RU: 6,
  TR: 2,
  US: 6,
};

export const getUserGeoDetails = async () => {
  // Self-host doesn't need a country code — it only drives analytics attributes.
  // Skip the external Cloudflare calls entirely to keep the install offline-clean.
  if (isSelfHosted()) {
    return { loc: "ZZ" };
  }

  const endpoints = [
    "https://www.cloudflare.com/cdn-cgi/trace",
    "https://cf-ns.com/cdn-cgi/trace", // Cloudflare China Network
  ];

  try {
    const promises = endpoints.map((endpoint) => fetch(endpoint));
    const response = await Promise.any(promises);
    const userDetailsString = await response.text();
    const userDetails = userDetailsString?.split("\n")?.reduce((result, pair) => {
      const [key, value] = pair.split("=");
      return { ...result, [key]: value };
    }, {});

    return userDetails;
  } catch (error) {
    Logger.log("Error while getting user GeoDetails", error);
  }
};
