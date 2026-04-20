import { withNextMd } from "next-md/config";

export default withNextMd(
  {
    reactStrictMode: true,
  },
  {
    cacheTTL: 600,
    internalRoutePrefix: "next_md",
    bots: {
      trainingScrapers: "block",
      searchCrawlers: "markdown",
      userAgents: "markdown",
    },
    llmsTxt: {
      title: "Fixture App",
      description: "Fixture site for next-md integration testing",
      pages: [
        { path: "/", title: "Home" },
        { path: "/docs", title: "Docs" },
      ],
    },
  },
);
