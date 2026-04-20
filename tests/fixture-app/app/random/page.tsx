export const dynamic = "force-dynamic";

export default function RandomPage() {
  const random = Math.random().toString().slice(2);
  return (
    <main>
      <h1>Random</h1>
      <p>value={random}</p>
    </main>
  );
}
