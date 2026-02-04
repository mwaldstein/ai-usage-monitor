import { useState, useEffect } from "react";
import { Schema as S, Either } from "effect";
import { getVersionUrl } from "../services/backendUrls";
import { VersionResponse } from "shared/api";

export function useVersion() {
  const [version, setVersion] = useState<string>("");
  const [commitSha, setCommitSha] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch(getVersionUrl());
        if (!response.ok) throw new Error("Failed to fetch version");
        const data: unknown = await response.json();
        const decoded = S.decodeUnknownEither(VersionResponse)(data);
        if (Either.isLeft(decoded)) {
          throw new Error("Invalid version response");
        }
        setVersion(decoded.right.version);
        setCommitSha(decoded.right.commitSha);
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
