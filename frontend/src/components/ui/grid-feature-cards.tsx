import { cn } from "@/lib/utils";
import React from "react";

export type FeatureType = {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
};

type FeatureCardProps = React.ComponentProps<"div"> & {
  feature: FeatureType;
};

export function FeatureCard({ feature, className, ...props }: FeatureCardProps) {
  return (
    <div className={cn("relative overflow-hidden p-6 bg-white border border-[#E4E2DC]", className)} {...props}>
      <div className="w-9 h-9 rounded-lg bg-[#FFF4EF] border border-[#F45B22]/20 flex items-center justify-center mb-4">
        <feature.icon className="text-[#F45B22] h-5 w-5" strokeWidth={1.8} aria-hidden />
      </div>
      <h3 className="font-author text-base font-bold text-[#333742] mb-1.5 leading-snug">
        {feature.title}
      </h3>
      <p className="text-xs font-medium leading-relaxed text-[#2D3440]">
        {feature.description}
      </p>
    </div>
  );
}