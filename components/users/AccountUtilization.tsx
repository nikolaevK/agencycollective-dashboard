import { TrendingUp } from "lucide-react";

interface AccountUtilizationProps {
  assignedAccounts: number;
  totalClients: number;
}

export function AccountUtilization({ assignedAccounts, totalClients }: AccountUtilizationProps) {
  return (
    <div
      className="relative rounded-2xl p-6 lg:p-8 overflow-hidden text-white ac-gradient"
    >
      {/* Decorative blur */}
      <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      <TrendingUp className="absolute top-4 right-4 h-12 w-12 opacity-20" />

      <p className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">
        Linked Accounts
      </p>
      <p className="text-4xl font-black mb-1">{assignedAccounts}</p>
      <p className="text-sm font-medium text-white/70">
        Across {totalClients} client{totalClients !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
