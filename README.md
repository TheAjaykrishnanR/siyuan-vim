# siyuan-vim

A fork of [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) with vim integration supporting vim motions.

> This fork has been modified from the original repo with the help of **Gemini** as I simply dont want to (*am incapable*) of maintaining a large typescript/web project. I have tried (**instructed gemini**) to integrate codemirror's vim-core (`vim.js`) in a manner of minimal intrusivity to the original upstream repo so that keeping it updated against it will be relatively easier. For this we intercept the `keydown` event handler in `app/src/protyle/wysiwyg/keydown.ts` and capture key events to reroute it to a vim engine. How well this would work it in the future is to be seen but hope it works for now.

## Siyuan README

[README.md](https://github.com/TheAjaykrishnanR/siyuan-vim/blob/master/README_original.md)
