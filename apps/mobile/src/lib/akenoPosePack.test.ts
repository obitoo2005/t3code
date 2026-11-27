import { describe, expect, it } from "vite-plus/test";

import {
  buildAkenoPackRequest,
  buildAkenoPoseCacheFileName,
  normalizeAkenoPackUrl,
  parseAkenoPosePackManifest,
  resolveAkenoPoseFileUrl,
} from "./akenoPosePack";

describe("akenoPosePack", () => {
  it("normalizes GitHub shorthands, repo URLs, and raw pack URLs", () => {
    expect(normalizeAkenoPackUrl("obitoo2005/rias-assets")).toBe(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/main",
    );
    expect(normalizeAkenoPackUrl("obitoo2005/rias-assets@v2")).toBe(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/v2",
    );
    expect(normalizeAkenoPackUrl("https://github.com/obitoo2005/rias-assets")).toBe(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/main",
    );
    expect(
      normalizeAkenoPackUrl("https://raw.githubusercontent.com/obitoo2005/rias-assets/main/manifest.json"),
    ).toBe("https://raw.githubusercontent.com/obitoo2005/rias-assets/main");
    expect(normalizeAkenoPackUrl("https://cdn.example.com/akeno/")).toBe(
      "https://cdn.example.com/akeno",
    );
    expect(normalizeAkenoPackUrl("   ")).toBeNull();
    expect(normalizeAkenoPackUrl("file:///etc/passwd")).toBeNull();
  });

  it("parses valid manifests and rejects path traversal or duplicate ids", () => {
    const manifest = parseAkenoPosePackManifest({
      version: 1,
      baseUrl: "poses/",
      poses: [
        {
          id: "pose60",
          file: "akeno-pet-pose-60.webp",
          stance: "standing",
          whisper: "Stole your jacket~ 💜",
          roles: ["showcase", "settle"],
          rev: "abc123def456",
        },
        {
          id: "pose60",
          file: "duplicate.webp",
          stance: "perched",
          roles: ["showcase"],
        },
        {
          id: "evil",
          file: "../../etc/passwd",
          stance: "perched",
          roles: ["showcase"],
        },
        {
          id: "pose62",
          file: "akeno-pet-pose-62.webp",
          stance: "perched",
          roles: ["invalid-role"],
        },
      ],
    });

    expect(manifest).not.toBeNull();
    expect(manifest!.poses).toHaveLength(2);
    expect(manifest!.poses[0]).toEqual({
      id: "pose60",
      file: "akeno-pet-pose-60.webp",
      stance: "standing",
      whisper: "Stole your jacket~ 💜",
      roles: ["showcase", "settle"],
      rev: "abc123def456",
    });
    expect(manifest!.poses[1]).toEqual({
      id: "pose62",
      file: "akeno-pet-pose-62.webp",
      stance: "perched",
      roles: ["showcase"],
    });
  });

  it("resolves relative and absolute pose file URLs cleanly", () => {
    expect(
      resolveAkenoPoseFileUrl(
        "https://raw.githubusercontent.com/obitoo2005/rias-assets/main",
        "poses/",
        "akeno-pet-pose-60.webp",
      ),
    ).toBe(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/main/poses/akeno-pet-pose-60.webp",
    );
    expect(
      resolveAkenoPoseFileUrl(
        "https://cdn.example.com/pack/",
        undefined,
        "akeno-pet-pose-62.webp",
      ),
    ).toBe("https://cdn.example.com/pack/akeno-pet-pose-62.webp");
    expect(
      resolveAkenoPoseFileUrl(
        "https://cdn.example.com/pack",
        "poses/",
        "https://other.cdn.dev/custom.webp",
      ),
    ).toBe("https://other.cdn.dev/custom.webp");
  });

  it("builds revision-stamped cache filenames for clean invalidation", () => {
    expect(
      buildAkenoPoseCacheFileName({
        id: "pose60",
        file: "akeno-pet-pose-60.webp",
        stance: "standing",
        roles: ["showcase"],
        rev: "a1b2c3d4",
      }),
    ).toBe("pose60-a1b2c3d4.webp");
    expect(
      buildAkenoPoseCacheFileName({
        id: "pose62",
        file: "akeno-pet-pose-62.png",
        stance: "perched",
        roles: ["showcase"],
      }),
    ).toBe("pose62.png");
  });

  it("routes authenticated GitHub raw URLs through the Contents API for fine-grained PATs", () => {
    const authed = buildAkenoPackRequest(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/main/poses/akeno-pet-pose-66.webp",
      "github_pat_test123",
    );
    expect(authed.url).toBe(
      "https://api.github.com/repos/obitoo2005/rias-assets/contents/poses/akeno-pet-pose-66.webp?ref=main",
    );
    expect(authed.headers.Authorization).toBe("Bearer github_pat_test123");
    expect(authed.headers.Accept).toBe("application/vnd.github.raw+json");
    expect(authed.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");

    const unauthed = buildAkenoPackRequest(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/main/manifest.json",
      null,
    );
    expect(unauthed.url).toBe(
      "https://raw.githubusercontent.com/obitoo2005/rias-assets/main/manifest.json",
    );
    expect(unauthed.headers.Authorization).toBeUndefined();
  });
});
