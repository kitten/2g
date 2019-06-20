type bufferDescT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type bufferT;
type shaderT;
type pipelineT;
type bindingsT;

module Internals = {
  [@noalloc] external start: unit => unit = "tg_start";

  external makeBuffer: bufferDescT => bufferT = "tg_make_buffer";
  external makeShader: (~vs: string, ~fs: string) => shaderT = "tg_make_shader";

  external makePipeline: shaderT => pipelineT = "tg_make_pipeline";
  external makeBindings: bufferT => bindingsT = "tg_make_bindings";

  external applyPipeline: pipelineT => unit = "tg_apply_pipeline";
  external applyBindings: bindingsT => unit = "tg_apply_bindings";
  external applyVertexBuffer: bufferT => unit = "tg_apply_vertex_buffer";

  [@noalloc] external beginPass: unit => unit = "tg_begin_pass";
  [@noalloc] external draw: (int, int, int) => unit = "tg_draw";
  [@noalloc] external endPass: unit => unit = "tg_end_pass";
  [@noalloc] external commit: unit => unit = "tg_commit";
};

let start = (
  ~init: unit => 't,
  ~frame: 't => 't
) => {
  Callback.register("tg_init_cb", init);
  Callback.register("tg_frame_cb", frame);
  Internals.start();
};

let pragmaVersionRe = Str.regexp("#version 300 es");

let pragmaVersionTarget = switch (TwoG_glsl.getTarget()) {
| OpenGL => "#version 330"
| OpenGLES2 => "#version 200 es"
| OpenGLES3 => "#version 300 es"
| Metal => ""
};

let makeShader = (~vs, ~fs) => {
  let fixVersionPragma = Str.replace_first(pragmaVersionRe, pragmaVersionTarget);
  let vs = TwoG_glsl.convertVertexShader(vs) |> fixVersionPragma;
  let fs = TwoG_glsl.convertFragmentShader(fs) |> fixVersionPragma;
  Internals.makeShader(~vs, ~fs);
};

let makeBuffer = Internals.makeBuffer;
let makePipeline = Internals.makePipeline;
let makeBindings = Internals.makeBindings;
let applyPipeline = Internals.applyPipeline;
let applyBindings = Internals.applyBindings;
let applyVertexBuffer = Internals.applyVertexBuffer;
let beginPass = Internals.beginPass;
let draw = Internals.draw;
let endPass = Internals.endPass;
let commit = Internals.commit;
