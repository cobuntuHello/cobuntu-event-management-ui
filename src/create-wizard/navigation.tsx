"use client";

import * as React from "react";
import type { WizardLinkProps } from "./types";

/**
 * How the wizard's links render and navigate, from the host.
 *
 * The lifted components used next/link and next/navigation directly. The
 * wizard is also rendered on sites that are not Next, so links go through the
 * host's `renderLink` (the app passes next/link) and navigation through its
 * `navigate` (the app passes router.push). Defaults are a plain <a> and a
 * plain browser navigation.
 */
export function DefaultLink({ href, children, ...rest }: WizardLinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export function browserNavigate(href: string) {
  if (typeof window !== "undefined") window.location.assign(href);
}

interface WizardNav {
  renderLink: (props: WizardLinkProps) => React.ReactNode;
  navigate: (href: string) => void;
}

const NavContext = React.createContext<WizardNav>({
  renderLink: (p) => <DefaultLink {...p} />,
  navigate: browserNavigate,
});

export const WizardNavProvider = NavContext.Provider;

export function useWizardNav(): WizardNav {
  return React.useContext(NavContext);
}

/** A link through the host's renderer. */
export function WizardLink(props: WizardLinkProps) {
  const { renderLink } = useWizardNav();
  return <>{renderLink(props)}</>;
}
