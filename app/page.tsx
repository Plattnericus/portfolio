import About from "@/components/About";
import Contact from "@/components/Contact";
import Cursor from "@/components/Cursor";
import Enter from "@/components/Enter";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Index from "@/components/Index";
import Loader from "@/components/Loader";
import Nav from "@/components/Nav";
import Principles from "@/components/Principles";
import Reveal from "@/components/Reveal";
import Secret from "@/components/Secret";
import Shell from "@/components/Shell";
import Specimen from "@/components/Specimen";
import Screensaver from "@/components/Screensaver";
import Cinema from "@/components/Cinema";
import Skills from "@/components/Skills";
import Work from "@/components/Work";
import WorldCanvas from "@/components/WorldCanvas";
import { projects, site, skills } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${site.url}/#person`,
      name: site.name,
      alternateName: site.handle,
      url: site.url,
      jobTitle: site.role,
      email: `mailto:${site.email}`,
      sameAs: [site.github, site.modrinth],
      knowsAbout: skills.map((s) => s.name),
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      url: site.url,
      name: site.domain,
      description: site.description,
      inLanguage: "en",
      author: { "@id": `${site.url}/#person` },
    },
    {
      "@type": "ItemList",
      name: "Projects",
      itemListElement: projects.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "SoftwareSourceCode",
          name: p.name,
          description: p.description,
          url: p.live?.href ?? p.source,
          codeRepository: p.source,
          programmingLanguage: p.tech,
          author: { "@id": `${site.url}/#person` },
        },
      })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WorldCanvas />
      <Loader />
      <Nav />
      <main>
        <Hero />
        <About />
        <Skills />
        <Principles />
        <Enter />
        <Work />
        <Index />
        <Contact />
      </main>
      <Footer />
      <Cursor />
      <Reveal />
      <Secret />
      <Cinema />
      <Shell />
      <Specimen />
      <Screensaver />
    </>
  );
}
