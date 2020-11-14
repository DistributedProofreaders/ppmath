# ppmath
This tool takes a text file which includes Tex maths formulae. It makes an image for each formula which it places in an 'images' directory. Each formula in the text is replaced by a link to an image.
## Installation
1. Install node and npm.
2. Open a command prompt console and type

`npm install -g ppmath`

There may be few warning messages; these can safely be ignored. The tool can then be used from any directory.



##Use
The tool is run from a command prompt console. Make a directory where you want to work and place the file you want to convert in it.

Type

`ppmconvert -i infile -o outfile`

where `infile` is the file to convert and `outfile` will be the converted file. The image files will be placed in a subdirectory of the working directory called "images". This directory will be created if it does not already exist.

In the converted file the maths expressions, delimited by `\[...\]` for 'display' expressions or `\(...\)` for 'inline' expressions, are replaced by `<img>` links. The 'alt' attribute of the `<img>` will contain a text description of the formula which can be read by a screen-reader. The 'data-tex' attribute will contain the original maths expression (with the backslashes in the begin and end markers removed).
