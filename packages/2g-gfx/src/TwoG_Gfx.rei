exception InvalidAttrFormat(string);

/* sg_vertex_format */
type vertexFormat =
  | Invalid
  | Float
  | Float2
  | Float3
  | Float4
  | Byte4
  | Byte4N
  | UByte4
  | UByte4N
  | Short2
  | Short2N
  | Short4
  | Short4N
  | UInt10N2
  | Num
  | ForceU32;

type bufferDescT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type bufferT;
type shaderT;
type pipelineT;
type bindingsT;

let start: (~init: unit => 't, ~frame: 't => 't) => unit;
let makeShader: (~vs: string, ~fs: string, ~attrs: array(string)) => pipelineT;
let makePipeline: (shaderT, array(vertexFormat)) => pipelineT;
let makeProgram: (~vs: string, ~fs: string) => pipelineT;
let makeBuffer: bufferDescT => bufferT;
let makeBindings: bufferT => bindingsT;

let applyPipeline: pipelineT => unit;
let applyBindings: bindingsT => unit;
let applyVertexBuffer: bufferT => unit;

let beginPass: unit => unit;
let draw: (int, int, int) => unit;
let endPass: unit => unit;
let commit: unit => unit;
