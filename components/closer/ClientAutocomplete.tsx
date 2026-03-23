"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  displayName: string;
}

interface Props {
  clientName: string;
  onClientNameChange: (name: string) => void;
  clientUserId: string | null;
  onClientUserIdChange: (id: string | null) => void;
}

export function ClientAutocomplete({
  clientName,
  onClientNameChange,
  clientUserId,
  onClientUserIdChange,
}: Props) {
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (clientName.trim().length < 2 || clientUserId) {
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/closer/clients?q=${encodeURIComponent(clientName.trim())}`);
        const json = await res.json();
        setSuggestions(json.data ?? []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [clientName, clientUserId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectClient(client: Client) {
    onClientNameChange(client.displayName);
    onClientUserIdChange(client.id);
    setShowDropdown(false);
    setSuggestions([]);
  }

  function clearLinked() {
    onClientUserIdChange(null);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium text-foreground mb-1.5 block">Client Name</label>
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={clientName}
          onChange={(e) => {
            onClientNameChange(e.target.value);
            if (clientUserId) onClientUserIdChange(null);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder="Type client name..."
          className="flex h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow"
        />
        {clientUserId && (
          <button
            type="button"
            onClick={clearLinked}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {clientUserId && (
        <p className="text-xs text-primary mt-1 flex items-center gap-1">
          <Search className="h-3 w-3" />
          Linked to existing client
        </p>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => selectClient(client)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors text-left"
            >
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0")}>
                {client.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{client.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground mt-1">Searching clients...</p>
      )}
    </div>
  );
}
