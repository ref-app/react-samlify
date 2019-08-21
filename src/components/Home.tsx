import React, { useState, useEffect, ReactNode } from "react";
import { RouteComponentProps } from "react-router";
import { parse, stringify } from "query-string";
import axios from "axios";

import "./index.css";

const LOCALSTORAGE_TOKEN_FIELD = "auth_token";

type Props = RouteComponentProps & {};

type SSOProvider = "okta" | "azure";

type Profile = {
  email?: string;
  provider?: SSOProvider;
};

type SamlOption = {
  encrypted: boolean;
};

const Container = (props: { children: ReactNode }) => {
  return (
    <div className="vh-100 system-sans-serif flex flex-column items-center justify-center">
      {props.children}
    </div>
  );
};
interface OnClickUrl {
  url: string;
  newWindow?: boolean;
}
type OnClickOptions = OnClickUrl | (() => void);
const isUrl = (options: OnClickOptions): options is OnClickUrl =>
  typeof options === "object";

const Button = ({
  children,
  onClick: action
}: React.PropsWithChildren<{
  onClick: OnClickOptions;
}>) => {
  const buttonClass =
    "pa3 bg-transparent ma2 br3 f6 silver-gray outline-0 pointer";
  const buttonStyle: React.CSSProperties = { border: "1px solid #aaa" };
  if (isUrl(action)) {
    const { url, newWindow = false } = action;
    return (
      <button
        className={buttonClass}
        style={buttonStyle}
        onClick={() =>
          newWindow ? window.open(url) : (window.location.href = url)
        }
      >
        {children}
      </button>
    );
  } else {
    return (
      <button className={buttonClass} style={buttonStyle} onClick={action}>
        {children}
      </button>
    );
  }
};

export function Home(props: Props) {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [profile, setProfile] = useState<Profile>({});
  const [samlOption, setSamlOption] = useState<SamlOption>({ encrypted: true });

  const getQuery = (
    options: { userId?: string; provider?: SSOProvider } = {}
  ) => {
    console.log("--------->>>", samlOption);
    const mergedOptions: any = { ...options };
    if (samlOption.encrypted) {
      mergedOptions.encrypted = true;
    }
    const queryString = stringify(mergedOptions);
    return queryString ? `?${queryString}` : "";
  };

  const initRedirectRequestUrl = (provider: SSOProvider) =>
    `/sso/redirect${getQuery({ provider })}`;

  const initPostRequestUrl = (provider: SSOProvider) =>
    `/sso/post${getQuery({ provider })}`;

  const viewSpMetadataUrl = () => `/sp/metadata${getQuery()}`;

  const viewIdpMetadataUrl = (provider: SSOProvider) =>
    `/idp/metadata${getQuery({ provider })}`;

  const logout = () => {
    window.localStorage.removeItem(LOCALSTORAGE_TOKEN_FIELD);
    setAuthenticated(false);
    setProfile({});
  };

  // initialize single logout from sp side
  const singleLogoutRedirect = () => {
    // Enhancement: send the jwt-encoded auth token from localstorage instead
    const query = getQuery(
      profile && profile.email ? { userId: profile.email } : {}
    );
    window.location.href = `/sp/single_logout/redirect${query}`;
  };

  const getProfile = async (token: string) => {
    try {
      const { data } = await axios.get<{ profile: Profile }>("/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuthenticated(true);
      setProfile(data.profile);
    } catch (e) {
      setAuthenticated(false);
      setProfile({ email: null });
      window.localStorage.removeItem(LOCALSTORAGE_TOKEN_FIELD);
    }
  };

  const toggleEncrypted = () => {
    setSamlOption({
      ...samlOption,
      encrypted: !samlOption.encrypted
    });
  };

  const init = async () => {
    const token = window.localStorage.getItem(LOCALSTORAGE_TOKEN_FIELD);
    // if the token is already stored in localstoarge, call the service to verify if it's expired
    // if anything wrong, go back to the login scene
    if (token) {
      // verify the current auth token
      return await getProfile(token);
    }
    // this section
    const params = parse(props.location.search);
    if (params.auth_token && !Array.isArray(params.auth_token)) {
      window.localStorage.setItem(LOCALSTORAGE_TOKEN_FIELD, params.auth_token);
      await getProfile(params.auth_token);
      // remove the auth_token part in
      props.history.replace("/");
    }
    // initial state
  };

  useEffect(() => {
    init();
    return () => null;
  }, []);

  if (!authenticated) {
    return (
      <Container>
        <div className="">
          <div style={{ display: "block" }}>
            <Button onClick={{ url: initRedirectRequestUrl("okta") }}>
              Okta - redirect
            </Button>
            <Button onClick={{ url: initPostRequestUrl("okta") }}>
              Okta - post
            </Button>
            <Button
              onClick={{ url: viewIdpMetadataUrl("okta"), newWindow: true }}
            >
              Okta Metadata
            </Button>
          </div>
          <div style={{ display: "block" }}>
            <Button onClick={{ url: initRedirectRequestUrl("azure") }}>
              Azure - redirect
            </Button>
            <Button onClick={{ url: initPostRequestUrl("azure") }}>
              Azure - post
            </Button>
            <Button
              onClick={{ url: viewIdpMetadataUrl("azure"), newWindow: true }}
            >
              Azure Metadata
            </Button>
          </div>
          <div style={{ display: "block" }}>
            <Button onClick={{ url: viewSpMetadataUrl(), newWindow: true }}>
              SP Metadata
            </Button>
          </div>
        </div>
        <div className="pb2 f6 silver mv3 bb b--black-20 bw1 tc">Options</div>
        <div>
          <label className="cb-container f6 silver flex">
            <span>with encryption</span>
            <input
              type="checkbox"
              defaultChecked={samlOption.encrypted}
              onClick={() => toggleEncrypted()}
            />
            <span className="checkmark" />
          </label>
        </div>
      </Container>
    );
  }
  {
    /** render screen after login in */
  }
  return (
    <Container>
      <div className="flex flex-column">
        <span className="mb3">
          Welcome back <b>{profile.email}</b>
        </span>
        <span className="mb3">
          Using <em>{profile.provider}</em> provider
        </span>
        <Button onClick={() => logout()}>Logout</Button>
        <Button onClick={() => singleLogoutRedirect()}>
          Single Logout (Redirect)
        </Button>
      </div>
    </Container>
  );
}
