import { withNextMd } from "site-md/config";

export default withNextMd(
  {
    reactStrictMode: true,
  },
  {
    cacheTTL: 600,
    internalRoutePrefix: "site_md",
    bots: {
      trainingScrapers: "block",
      searchCrawlers: "markdown",
      userAgents: "markdown",
    },
    llmsTxt: {
      title: "Fixture App",
      description: "Fixture site for site-md integration testing",
      pages: [
        { path: "/", title: "Home" },
        { path: "/docs", title: "Docs" },
      ],
    },
  },
);
