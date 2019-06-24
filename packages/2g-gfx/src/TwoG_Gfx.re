exception InvalidAttribute(string);
exception InvalidTexture(string);
exception InvalidUniform(string);

/* sg_shader_stage */
type shaderStage =
  | Vertex
  | Fragment;

/* sg_action */
type passAction =
  | Clear
  | Load;

/* sg_vertex_format */
type vertexFormat =
  | IN_INVALID
  | IN_FLOAT
  | IN_FLOAT2
  | IN_FLOAT3
  | IN_FLOAT4;

/* sg_image_type */
type textureFormat =
  | TEX_DEFAULT
  | TEX_SAMPLER2D
  | TEX_SAMPLERCUBE
  | TEX_SAMPLER3D
  | TEX_SAMPLERARRAY;

type uniformFormat =
  | UNI_FLOAT
  | UNI_FLOAT2
  | UNI_FLOAT3
  | UNI_FLOAT4
  | UNI_MAT4;

type primitiveType =
  | PRIMITIVE_POINTS
  | PRIMITIVE_LINES
  | PRIMITIVE_LINE_STRIP
  | PRIMITIVE_TRIANGLES
  | PRIMITIVE_TRINAGLES_STRIP;

type cullMode =
  | CULL_NONE
  | CULL_FRONT
  | CULL_BACK
  | CULL_DEFAULT;

type faceWinding =
  | WINDING_CCW
  | WINDING_CW;

type depthComparison =
  | COMPARE_NEVER
  | COMPARE_LESS
  | COMPARE_EQUAL
  | COMPARE_LESS_EQUAL
  | COMPARE_GREATER
  | COMPARE_NOT_EQUAL
  | COMPARE_GREATER_EQUAL
  | COMPARE_ALWAYS
  | COMPARE_DEFAULT;

type stencilOperation =
  | STENCIL_KEEP
  | STENCIL_ZERO
  | STENCIL_REPLACE
  | STENCIL_INCR_CLAMP
  | STENCIL_DECR_CLAMP
  | STENCIL_INVERT
  | STENCIL_INCR_WRAP
  | STENCIL_DECR_WRAP;

type blendFactor =
  | BLEND_ZERO
  | BLEND_ONE
  | BLEND_SRC_COLOR
  | BLEND_ONE_MINUS_SRC_COLOR
  | BLEND_SRC_ALPHA
  | BLEND_ONE_MINUS_SRC_ALPHA
  | BLEND_DST_COLOR
  | BLEND_ONE_MINUS_DST_COLOR
  | BLEND_DST_ALPHA
  | BLEND_ONE_MINUS_DST_ALPHA
  | BLEND_SRC_ALPHA_SATURATED
  | BLEND_COLOR
  | ONE_MINUS_BLEND_COLOR
  | BLEND_ALPHA
  | ONE_MINUS_BLEND_ALPHA;

type blendOperation =
  | BLEND_OP_ADD
  | BLEND_OP_SUBTRACT
  | BLEND_OP_REVERSE_SUBTRACT;

/* sg_uniform_type */
type uniform =
  | Float(float)
  | Vec2(Vec2.t)
  | Vec3(Vec3.t)
  | Vec4(Vec4.t)
  | Mat4(Mat4.t);

type textureT = (string, textureFormat);
type uniformDescT = (string, uniformFormat);
type attributeT = (int, vertexFormat);

/* shader desc */
type shaderDescT = {
  attrs: array(string),
  textures: array(textureT),
  vsUniforms: array(uniformDescT),
  fsUniforms: array(uniformDescT)
};

/* pipeline desc */
type pipelineSettingT =
  | Index
  | Primitive(primitiveType)
  | DepthComparison(depthComparison)
  | StencilFront(stencilOperation, stencilOperation, stencilOperation, depthComparison)
  | StencilBack(stencilOperation, stencilOperation, stencilOperation, depthComparison)
  | BlendColor(Vec4.t)
  | BlendModeRgb(blendFactor, blendFactor, blendOperation)
  | BlendModeAlpha(blendFactor, blendFactor, blendOperation)
  | CullMode(cullMode)
  | FaceWinding(faceWinding)
  | DepthBias(float, float, float);

type vertexBigarrayT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type indexBigarrayT = Bigarray.Array1.t(int, Bigarray.int16_unsigned_elt, Bigarray.c_layout);

type vertexBufferT;
type indexBufferT;

type shaderT;
type pipelineT;
type bindingsT;

let colorBlack = Vec4.make(0.0, 0.0, 0.0, 1.0);

let getInputName = (input: GlslOptimizer.shaderDescT) =>
  input.name;

let toAttrFormat = (input: GlslOptimizer.shaderDescT) => {
  switch (input.basicType, input.vectorSize) {
  | (Float, 1) => IN_FLOAT
  | (Float, 2) => IN_FLOAT2
  | (Float, 3) => IN_FLOAT3
  | (Float, 4) => IN_FLOAT4
  | (Float, _) =>
    raise(InvalidAttribute("Float attributes can only have dimensions of 1 to 4."))
  | (_, _) =>
    raise(InvalidAttribute("Attributes must be of type Float."))
  };
};

let toTextureFormat = (basicType: GlslOptimizer.basicType) => {
  switch (basicType) {
  | Tex2D => TEX_SAMPLER2D
  | Tex3D => TEX_SAMPLER3D
  | Cube => TEX_SAMPLERCUBE
  | Array2D => TEX_SAMPLERARRAY
  | _ =>
    raise(InvalidTexture("Sampler must be of type 2D, 3D, Cube, or 2DArray."))
  };
};

let toUniformFormat = (uniform: GlslOptimizer.shaderDescT) => {
  switch (uniform.basicType, uniform.vectorSize, uniform.matrixSize) {
  | (Float, 1, 1) => UNI_FLOAT
  | (Float, 2, 1) => UNI_FLOAT2
  | (Float, 3, 1) => UNI_FLOAT3
  | (Float, 4, 1) => UNI_FLOAT4
  | (Float, 4, 4) => UNI_MAT4
  | (Float, _, _) =>
    raise(InvalidUniform("Float uniforms can only be float, vec2, vec3, vec4, or mat4"))
  | (_, _, _) =>
    raise(InvalidUniform("Uniforms must be of type Float."))
  }
};

[@noalloc] external _start: unit => unit = "tg_start";

let start = (~init: unit => 't, ~frame: 't => 't) => {
  Callback.register("tg_init_cb", init);
  Callback.register("tg_frame_cb", frame);
  _start();
};

external makeShader: (
  ~vs: string,
  ~fs: string,
  ~desc: shaderDescT,
) => shaderT = "tg_make_shader";

external makePipeline: (
  shaderT,
  array(attributeT),
  array(pipelineSettingT)
) => pipelineT = "tg_make_pipeline";

let makeProgram = (
  ~vs,
  ~fs,
  settings
) => {
  let vertex = GlslOptimizer.convertShader(Vertex, vs);
  let fragment = GlslOptimizer.convertShader(Fragment, fs);

  let inputSize = GlslOptimizer.getInputLength(vertex);
  let inputs = Array.init(inputSize, GlslOptimizer.getInputDesc(vertex));
  let attrs = Array.map(getInputName, inputs);
  let formats = Array.mapi((index, input) => (index, toAttrFormat(input)), inputs);

  let textures = Array.init(GlslOptimizer.getTextureLength(fragment), index => {
    let textureDesc = GlslOptimizer.getTextureDesc(fragment, index);
    (textureDesc.name, toTextureFormat(textureDesc.basicType))
  });

  let vsUniforms = Array.init(GlslOptimizer.getUniformLength(vertex), index => {
    let uniformDesc = GlslOptimizer.getUniformDesc(vertex, index);
    (uniformDesc.name, toUniformFormat(uniformDesc))
  });

  let fsUniforms = Array.init(GlslOptimizer.getUniformLength(fragment), index => {
    let uniformDesc = GlslOptimizer.getUniformDesc(fragment, index);
    (uniformDesc.name, toUniformFormat(uniformDesc))
  });

  let desc = { attrs, textures, vsUniforms, fsUniforms };
  let vs = GlslOptimizer.getOutput(vertex);
  let fs = GlslOptimizer.getOutput(fragment);
  let shader = makeShader(~vs, ~fs, ~desc);

  makePipeline(shader, formats, settings);
};

external makeVertexBuffer: vertexBigarrayT => vertexBufferT = "tg_make_vertex_buffer";
external makeIndexBuffer: indexBigarrayT => indexBufferT = "tg_make_index_buffer";

let vertexBufferOfArray = (data: array(float)) =>
  makeVertexBuffer(Bigarray.Array1.of_array(Float32, C_layout, data));
let indexBufferOfArray = (data: array(int)) =>
  makeIndexBuffer(Bigarray.Array1.of_array(Int16_unsigned, C_layout, data));

external applyPipeline: pipelineT => unit = "tg_apply_pipeline";

[@noalloc] external applyBuffers: (
  ~indexBuffer: indexBufferT=?,
  array(vertexBufferT)
) => unit = "tg_apply_buffers";

[@noalloc] external _applyUniforms:
  (shaderStage, int, array(uniform)) => unit = "tg_apply_uniforms";

let applyVertexUniforms = (uniforms: array(uniform)) => _applyUniforms(Vertex, 0, uniforms);
let applyFragmentUniforms = (uniforms: array(uniform)) => _applyUniforms(Fragment, 0, uniforms);

[@noalloc] external _beginPass: (Vec4.t, bool) => unit = "tg_begin_pass";

let beginPass = (
  ~clearColor=colorBlack,
  ~shouldClear=true,
  ()
) => _beginPass(clearColor, shouldClear);

[@noalloc] external draw: (int, int, int) => unit = "tg_draw";
[@noalloc] external endPass: unit => unit = "tg_end_pass";
[@noalloc] external commit: unit => unit = "tg_commit";

external now: unit => float = "tg_now";
