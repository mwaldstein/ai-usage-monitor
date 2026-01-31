import { useState, useEffect } from "react";
import { getVersionUrl } from "../services/backendUrls";

export function useVersion() {
  const [version, setVersion] = useState<string>("");
  const [commitSha, setCommitSha] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch(getVersionUrl());
        if (!response.ok) throw new Error("Failed to fetch version");
        const data = await response.json();
        setVersion(data.version);
        setCommitSha(data.commitSha);
      } catch (err) {
        console.error("Error fetching version:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchVersion();
  }, []);

  return { version, commitSha, loading };
}
