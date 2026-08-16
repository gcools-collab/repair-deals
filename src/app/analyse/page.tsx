import AnalyseForm from "./analyse-form";

type AnalysePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AnalysePage({ searchParams }: AnalysePageProps) {
  const parameters = await searchParams;
  const imported = first(parameters.source) === "scanner";
  const title = first(parameters.title)?.trim() || "";
  const rawPrice = first(parameters.purchasePrice);
  const parsedPrice = rawPrice === undefined ? null : Number(rawPrice);
  const purchasePrice = parsedPrice !== null && Number.isFinite(parsedPrice) && parsedPrice >= 0
    ? parsedPrice
    : null;

  return <AnalyseForm imported={imported} importedTitle={title} importedPrice={purchasePrice} />;
}
