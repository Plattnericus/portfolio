import ClawdPet from "@/components/clawd/ClawdPet";
import GLCanvas from "@/components/gl/GLCanvasLazy";
import IntroLoader from "@/components/loader/IntroLoader";
import CursorGlow from "@/components/motion/CursorGlow";
import ReducedMotionNotice from "@/components/motion/ReducedMotionNotice";
import Footer from "@/components/lenis-style/Footer";
import Heat from "@/components/lenis-style/Heat";
import Hero from "@/components/lenis-style/Hero";
import ProgressBar from "@/components/lenis-style/ProgressBar";
import Rethink from "@/components/lenis-style/Rethink";
import Showcase from "@/components/lenis-style/Showcase";
import Solution from "@/components/lenis-style/Solution";
import Why from "@/components/lenis-style/Why";
import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import { projects } from "@/lib/projects";
import { absoluteUrl, siteConfig } from "@/lib/site";

/* build date keeps dateModified honest without manual bumps */
const buildDate = new Date().toISOString().slice(0, 10);

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteConfig.url}#webpage`,
      url: siteConfig.url,
      name: siteConfig.title,
      headline: "Nexor / Plattnericus",
      description: siteConfig.description,
      inLanguage: "en",
      isPartOf: {
        "@id": `${siteConfig.url}#website`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: absoluteUrl("/opengraph-image.jpg"),
        width: 1200,
        height: 630,
      },
      dateModified: buildDate,
      breadcrumb: {
        "@id": `${siteConfig.url}#breadcrumbs`,
      },
      about: {
        "@id": `${siteConfig.url}#person`,
      },
    },
    {
      "@type": "Person",
      "@id": `${siteConfig.url}#person`,
      name: "Nexor / Plattnericus",
      alternateName: ["Nexor", "Plattnericus"],
      url: siteConfig.url,
      email: `mailto:${siteConfig.email}`,
      image: absoluteUrl("/opengraph-image.jpg"),
      sameAs: [
        siteConfig.github,
        siteConfig.modrinth,
        ...projects.flatMap((project) => (project.liveUrl ? [project.liveUrl] : [])),
      ],
      jobTitle: "Fullstack Developer",
      homeLocation: {
        "@type": "Place",
        name: "South Tyrol, Italy",
      },
      hasOccupation: {
        "@type": "Occupation",
        name: "Fullstack Developer",
        skills:
          "Next.js, TypeScript, React, Three.js, DevOps, Docker, Linux, Cloudflare, cybersecurity fundamentals",
      },
      description:
        "Student developer from South Tyrol building fullstack web apps, selfhosted systems, DevOps workflows and security-focused infrastructure.",
      knowsAbout: [
        "Fullstack Development",
        "Next.js",
        "TypeScript",
        "React",
        "DevOps",
        "Docker",
        "Linux",
        "Cloudflare",
        "Cybersecurity",
        "Selfhosting",
        "WebGL",
        "React Three Fiber",
        "Search Engine Optimization",
        "AI answer engine optimization",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "email",
        email: siteConfig.email,
        availableLanguage: ["en", "de", "it"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      description: siteConfig.description,
      inLanguage: "en",
      publisher: {
        "@id": `${siteConfig.url}#person`,
      },
      potentialAction: {
        "@type": "ReadAction",
        target: [siteConfig.url, absoluteUrl("/ai"), absoluteUrl("/llms.txt")],
      },
    },
    {
      "@type": "ProfilePage",
      "@id": `${siteConfig.url}#profile-page`,
      url: siteConfig.url,
      name: siteConfig.title,
      description: siteConfig.description,
      dateModified: buildDate,
      isPartOf: {
        "@id": `${siteConfig.url}#website`,
      },
      mainEntity: {
        "@id": `${siteConfig.url}#person`,
      },
      about: [
        "Fullstack development",
        "DevOps infrastructure",
        "Cybersecurity learning",
        "Real deployed software projects",
      ],
      significantLink: [
        siteConfig.github,
        absoluteUrl("/ai"),
        absoluteUrl("/llms.txt"),
        absoluteUrl("/llms-full.txt"),
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${siteConfig.url}#projects`,
      name: "Nexor / Plattnericus project showcase",
      itemListElement: projects.map((project, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SoftwareSourceCode",
          "@id": `${siteConfig.url}#project-${project.slug}`,
          name: project.name,
          alternateName: project.repoName,
          description: project.description,
          ...(project.githubUrl ? { codeRepository: project.githubUrl } : {}),
          ...(project.liveUrl ? { url: project.liveUrl } : {}),
          creator: {
            "@id": `${siteConfig.url}#person`,
          },
          keywords: project.tech.join(", "),
        },
      })),
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteConfig.url}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
        { "@type": "ListItem", position: 2, name: "AI Index", item: absoluteUrl("/ai") },
      ],
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <SmoothScrollProvider>
        <IntroLoader />
        <ProgressBar />
        <CursorGlow />
        <GLCanvas />
        <ClawdPet />
        <ReducedMotionNotice />
        <main>
          <Hero />
          <Why />
          <Showcase />
          <Rethink />
          <Solution />
          <Heat />
          <Footer />
        </main>
      </SmoothScrollProvider>
    </>
  );
}
