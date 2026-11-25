import About from "@/components/About";
import Contact from "@/components/Contact";
import Cursor from "@/components/Cursor";
import Enter from "@/components/Enter";
import Extras from "@/components/Extras";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Index from "@/components/Index";
import Loader from "@/components/Loader";
import Nav from "@/components/Nav";
import Principles from "@/components/Principles";
import Quote from "@/components/Quote";
import Reveal from "@/components/Reveal";
import Skills from "@/components/Skills";
import Work from "@/components/Work";
import WorldCanvas from "@/components/WorldCanvas";
import { projects, site, skills } from "@/lib/site";

/** when this page was built: the profile's last change for search engines */
const built = new Date().toISOString();
const person = `${site.url}/#person`;
const website = `${site.url}/#website`;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      // the page is a profile of one person: how search engines should read it
      "@type": "ProfilePage",
      "@id": `${site.url}/#profile`,
      url: site.url,
      name: site.title,
      description: site.description,
      inLanguage: "en",
      dateModified: built,
      isPartOf: { "@id": website },
      mainEntity: { "@id": person },
      about: { "@id": person },
      primaryImageOfPage: { "@type": "ImageObject", url: `${site.url}/opengraph-image.png` },
    },
    {
      "@type": "Person",
      "@id": person,
      name: site.name,
      alternateName: site.handle,
      url: site.url,
      image: `${site.url}/opengraph-image.png`,
      description: site.description,
      jobTitle: site.role,
      email: `mailto:${site.email}`,
      sameAs: [site.github, site.modrinth],
      knowsAbout: skills.map((s) => s.name),
    },
    {
      "@type": "WebSite",
      "@id": website,
      url: site.url,
      name: site.domain,
      description: site.description,
      inLanguage: "en",
      author: { "@id": person },
      publisher: { "@id": person },
    },
    {
      "@type": "ItemList",
      name: "Projects",
      numberOfItems: projects.length,
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
          author: { "@id": person },
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
        <Quote index={0} mode="type" section="work" />
        <Index />
        <Contact />
      </main>
      <Footer />
      <Cursor />
      <Reveal />
      <Extras />
    </>
  );
}
