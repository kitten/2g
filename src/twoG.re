type bufferDescT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type bufferT;
type shaderT;
type pipelineT;
type bindingsT;

[@noalloc] external _start: unit => unit = "tg_start";

let start = (
  ~init: unit => 't,
  ~frame: 't => 't
) => {
  Callback.register("tg_init_cb", init);
  Callback.register("tg_frame_cb", frame);
  _start();
};

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
