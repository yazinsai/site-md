export default async function EchoPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const rawLang = searchParams.lang;
  const lang = Array.isArray(rawLang) ? rawLang[0] : rawLang ?? "unset";

  return (
    <main>
      <h1>Echo</h1>
      <p>lang={lang}</p>
    </main>
  );
}
