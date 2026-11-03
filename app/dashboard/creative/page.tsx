import { Suspense } from "react";
import { CreativeStudio } from "@/components/creative/CreativeStudio";
import CreativeLoading from "./loading";

export default function CreativePage() {
  return (
    <Suspense fallback={<CreativeLoading />}>
      <CreativeStudio />
    </Suspense>
  );
}
