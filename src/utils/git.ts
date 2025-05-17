import { LogResult, simpleGit, SimpleGit } from "simple-git";
import { UNCOMMITTED_SHA } from "../config.js";
import { shouldIgnorePath } from "./fs.js";
import { tokenize } from "./tokenizer.js";

const git: SimpleGit = simpleGit(process.cwd());

export type GitCommitHunk = {
  filePath: string;
  name: string;
  header: string;
  selected: boolean;
  tokenCount: number;
  content: string;
  hunkIndex: number;
  commitSha: string;
  commitSubject: string;
};

export type GitCommitFile = {
  path: string;
  hunks: GitCommitHunk[];
  tokenCount: number;
  expanded?: boolean;
  selected?: boolean;
  partiallySelected?: boolean;
};

export type GitCommit = {
  sha: string;
  subject: string;
  expanded?: boolean;
  selected?: boolean;
  partiallySelected?: boolean;
  tokenCount: number;
  files: GitCommitFile[];
};

export const isGitCommit = (item: GitCommit | GitCommitFile | GitCommitHunk): item is GitCommit => {
  return (item as GitCommit).sha !== undefined;
};

const parseDiffToCommitFiles = (diffContent: string, commitSha: string, commitSubject: string): GitCommitFile[] => {
  const fileBlocks = diffContent.split(/^diff --git /m).slice(1);
  const fileMap = new Map<string, GitCommitFile>();

  for (const block of fileBlocks) {
    const headerMatch = /^-{3} a\/(.+?)\n\+{3} b\/(.+?)\n/m.exec(block);
    let filePath: string | null = null;

    if (headerMatch) {
      filePath = headerMatch[1] === "/dev/null" ? headerMatch[2] : headerMatch[1];
    } else {
      const addMatch = /\+{3} b\/(.+?)\n/m.exec(block);
      const delMatch = /--- a\/(.+?)\n/m.exec(block);
      filePath = addMatch?.[1] ?? delMatch?.[1] ?? null;
    }
    if (!filePath || filePath === "/dev/null") continue;

    const normalizedFilePath = filePath.replace(/^\/+/, "").replace(/\/+/g, "/");
    if (shouldIgnorePath(normalizedFilePath)) continue;
    let commitFile = fileMap.get(normalizedFilePath);
    if (!commitFile) {
      commitFile = {
        path: normalizedFilePath,
        hunks: [],
        tokenCount: 0,
      };
      fileMap.set(normalizedFilePath, commitFile);
    }

    const hunkParts = block.split(/^@@/m).slice(1);
    const seenHunks = new Set();

    for (const hunk of hunkParts) {
      const lines = hunk.split("\n");
      const hunkHeader = `@@${lines[0]}@@`;

      if (seenHunks.has(hunkHeader)) break;
      seenHunks.add(hunkHeader);

      const body = lines.slice(1).join("\n");
      const tokens = tokenize(body).length;
      commitFile.tokenCount += tokens;

      const currentHunkIndex = commitFile.hunks.length;

      const hunkItem: GitCommitHunk = {
        name: `${normalizedFilePath.split("/").pop()}#${currentHunkIndex + 1}`,
        filePath: normalizedFilePath,
        selected: false,
        tokenCount: tokens,
        header: hunkHeader,
        content: body.trimEnd(),
        hunkIndex: currentHunkIndex,
        commitSha,
        commitSubject,
      };
      commitFile.hunks.push(hunkItem);
    }
  }
  return Array.from(fileMap.values());
};

export const getGitTree = async (
  maxCommits = 20,
  getIsSelected: (path: string) => boolean = () => false,
  getIsExpanded: (path: string) => boolean = () => false,
  skipCommits = 0,
  includeUncommitted = true
): Promise<GitCommit[]> => {
  const allCommits: GitCommit[] = [];
  let uncommittedNode: GitCommit | null = null;
  if (includeUncommitted) {
    const uncommittedSha = UNCOMMITTED_SHA;
    const uncommittedSubject = "Uncommitted Changes";
    uncommittedNode = {
      sha: uncommittedSha,
      subject: uncommittedSubject,
      expanded: getIsExpanded(uncommittedSha),
      selected: getIsSelected(uncommittedSha),
      tokenCount: 0,
      files: [],
    };
    allCommits.push(uncommittedNode);
  }

  if (includeUncommitted && uncommittedNode) {
    const stagedDiff = await git.diff(["--no-ext-diff", "--cached", "--patch", "--unified=3", "--color=never"]);
    const unstagedDiff = await git.diff(["--no-ext-diff", "--patch", "--unified=3", "--color=never"]);
    const combinedDiff = `${stagedDiff}\n${unstagedDiff}`.trim();
    if (combinedDiff) {
      const commitFiles = parseDiffToCommitFiles(combinedDiff, uncommittedNode.sha, uncommittedNode.subject);
      uncommittedNode.files = commitFiles;
      uncommittedNode.tokenCount = commitFiles.reduce((n, d) => n + d.tokenCount, 0);
    }
  }

  let logResult: LogResult | null = null;
  try {
    logResult = await git.log({ maxCount: maxCommits, "--skip": skipCommits });
  } catch {
    return allCommits;
  }

  const commitPromises = logResult.all.map(async (logEntry) => {
    const sha = logEntry.hash;
    const subject = logEntry.message.trim();
    try {
      const commitDiff = await git.show([sha, "--patch", "--unified=3", "--color=never", "--first-parent", "-m"]);
      if (!commitDiff) return null;
      const commitFiles = parseDiffToCommitFiles(commitDiff, sha, subject);
      let totalCommitTokenCount = 0;

      for (const file of commitFiles) {
        totalCommitTokenCount += file.tokenCount;
      }

      return {
        sha,
        subject,
        expanded: getIsExpanded(sha),
        selected: getIsSelected(sha),
        tokenCount: totalCommitTokenCount,
        files: commitFiles,
      } satisfies GitCommit;
    } catch {
      return null;
    }
  });

  const resolvedCommits = await Promise.all(commitPromises);
  for (const commitNode of resolvedCommits) {
    if (commitNode) {
      allCommits.push(commitNode);
    }
  }

  return allCommits;
};
