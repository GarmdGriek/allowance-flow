import { auth } from "app/auth";
import { API_URL } from "../constants";
import { Apiclient } from "./Apiclient";
import type { RequestParams } from "./http-client";

const constructBaseUrl = (): string => {
  // If running locally, fall back to localhost
  if (!API_URL || API_URL === "undefined") {
    return window.location.origin;
  }
  return API_URL;
};

type BaseApiParams = Omit<RequestParams, "signal" | "baseUrl" | "cancelToken">;

const constructBaseApiParams = (): BaseApiParams => {
  return {
    credentials: "include",
    secure: true,
  };
};

const constructClient = () => {
  const baseUrl = constructBaseUrl();
  const baseApiParams = constructBaseApiParams();

  console.debug(`Baseurl for API client: ${baseUrl}`);

  return new Apiclient({
    baseUrl,
    baseApiParams,
    customFetch: (url, options) => {
      return fetch(url, options);
    },
    securityWorker: async () => {
      return {
        headers: {
          Authorization: await auth.getAuthHeaderValue(),
        },
      };
    },
  });
};

const apiclient = constructClient();

export default apiclient;
