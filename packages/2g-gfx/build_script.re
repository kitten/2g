open Bsb_internals;

let ( +/ ) = Filename.concat;

let includes = ["include"];
let isMacOS = Sys.unix && input_line(Unix.open_process_in("uname")) == "Darwin";

let flags = ["-O3"];
let objcflags = isMacOS ? ["-O3", "-x objective-c", "-fobjc-arc"] : ["-O3"];

gcc(~includes, ~flags, "lib" +/ "glad.o", ["include" +/ "glad" +/ "glad.c"]);
gcc(~includes, ~flags=objcflags, "lib" +/ "sokol.o", ["include" +/ "sokol" +/ "sokol.c"]);
gcc(~includes, ~flags, "lib" +/ "2g-gfx.o", ["src" +/ "TwoG_Gfx.c"]);
