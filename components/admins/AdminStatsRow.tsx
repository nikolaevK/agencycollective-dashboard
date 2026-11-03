import { Users, ShieldCheck, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

interface AdminStatsRowProps {
  totalAdmins: number;
  superAdmins: number;
  recentChanges: number;
}

export function AdminStatsRow({ totalAdmins, superAdmins, recentChanges }: AdminStatsRowProps) {
  const cards = [
    { label: "Total Admins", value: totalAdmins, icon: Users },
    { label: "Super Admins", value: superAdmins, icon: ShieldCheck },
    { label: "Recent Changes", value: recentChanges, icon: Clock },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <CardDescription>{card.label}</CardDescription>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tracking-tight tabular-nums">{card.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
