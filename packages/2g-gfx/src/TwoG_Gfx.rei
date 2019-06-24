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
  | CULL_BACK;

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
  | COMPARE_ALWAYS;

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

type colorT = (float, float, float, float);
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

let makeVertexBuffer: vertexBigarrayT => vertexBufferT;
let makeIndexBuffer: indexBigarrayT => indexBufferT;
let vertexBufferOfArray: array(float) => vertexBufferT;
let indexBufferOfArray: array(int) => indexBufferT;

let start: (~init: unit => 't, ~frame: 't => 't) => unit;
let makeShader: (~vs: string, ~fs: string, ~attrs: array(string)) => pipelineT;

let makePipeline: (
  shaderT,
  array(attributeT),
  array(pipelineSettingT)
) => pipelineT;

let makeProgram: (
  ~vs: string,
  ~fs: string,
  array(pipelineSettingT)
) => pipelineT;

let applyPipeline: pipelineT => unit;
let applyBuffers: (~indexBuffer: indexBufferT=?, array(vertexBufferT)) => unit;
let applyVertexUniforms: array(uniform) => unit;
let applyFragmentUniforms: array(uniform) => unit;
let beginPass: (~clearColor: Vec4.t=?, unit) => unit;
let draw: (int, int, int) => unit;
let endPass: unit => unit;
let commit: unit => unit;
let now: unit => float;
