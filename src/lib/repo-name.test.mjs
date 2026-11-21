import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRepo } from "./repo-name.ts";

test("parseRepo takes owner/name, GitHub links and SSH remotes", () => {
  for (const input of ["octocat/Hello-World", " octocat/Hello-World ", "https://github.com/octocat/Hello-World", "http://www.github.com/octocat/Hello-World/",
    "github.com/octocat/Hello-World.git", "https://github.com/octocat/Hello-World/tree/main/src", "https://github.com/octocat/Hello-World?tab=readme#top",
    "git@github.com:octocat/Hello-World.git"]) {
    assert.equal(parseRepo(input), "octocat/Hello-World", input);
  }
  assert.equal(parseRepo("my-org/app.v2_final"), "my-org/app.v2_final");
});

test("parseRepo refuses anything else", () => {
  for (const input of ["", "octocat", "octocat/", "/Hello-World", "https://gitlab.com/octocat/Hello-World", "octo cat/x", "a/b c", "../etc/passwd"]) {
    assert.equal(parseRepo(input), null, input);
  }
});
