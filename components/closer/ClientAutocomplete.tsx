"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div ref={containerRef} className="relative grid gap-2">
      <Label>Client Name</Label>
      <div className="relative">
        <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
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
          className="pl-9 pr-9"
        />
        {clientUserId && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={clearLinked}
            aria-label="Unlink client"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {clientUserId && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Search className="size-3" />
          Linked to existing client
        </p>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 max-h-48 overflow-y-auto">
          {suggestions.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => selectClient(client)}
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground text-left"
            >
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="text-xs font-medium">
                  {client.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{client.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground">Searching clients...</p>
      )}
    </div>
  );
}
