# 📦 PromptPack

PromptPack is a small CLI tool that helps you turn a list of files into a prompt that you can feed into an LLM.

https://github.com/3rd/promptpack/assets/59587503/0c243caf-fbd2-4f2e-a343-fac2b089a4ff

## Installation

PromptPack is hosted on NPM, so you can either:

- install `promptpack` globally with your preferred package manager (ex. `npm install -g promptpack`)
- or run it directly with `npx/pnpx/bunx promptpack`

## Usage

**Interactive mode**

This is the default (any only right now) mode, which lets you interactively navigate, select, and package files into a prompt, and copy it to the system clipboard.

Navigate up and down with arrows or `k`/`j`, expand/collapse directories with `Tab` or `Enter`, mark the files you want to include with `Space`, and press `y` to copy the prompt.

Tokens are estimated for GPT-4/GPT-3.5 using [https://github.com/dqbd/tiktoken](https://github.com/dqbd/tiktoken).
