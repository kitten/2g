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

[@noalloc] external makeBuffer: bufferDescT => bufferT = "tg_make_buffer";
[@noalloc] external makeShader: (~vs: string, ~fs: string) => shaderT = "tg_make_shader";
[@noalloc] external makePipeline: shaderT => pipelineT = "tg_make_pipeline";
[@noalloc] external makeBindings: bufferT => bindingsT = "tg_make_bindings";
[@noalloc] external beginPass: unit => unit = "tg_begin_pass";
[@noalloc] external draw: (int, int, int) => unit = "tg_draw";
[@noalloc] external endPass: unit => unit = "tg_end_pass";
[@noalloc] external commit: unit => unit = "tg_commit";
[@noalloc] external applyPipeline: pipelineT => unit = "tg_apply_pipeline";
[@noalloc] external applyBindings: bindingsT => unit = "tg_apply_bindings";
[@noalloc] external applyVertexBuffer: bufferT => unit = "tg_apply_vertex_buffer";
