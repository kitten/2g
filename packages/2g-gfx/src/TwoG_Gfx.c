#include <assert.h>
#include <stdio.h>
#include <string.h>

#include <caml/custom.h>
#include <caml/callback.h>
#include <caml/alloc.h>
#include <caml/memory.h>
#include <caml/mlvalues.h>
#include <caml/bigarray.h>

#include "sokol.h"

#define Val_none Val_int(0)

#if defined(SOKOL_METAL)
  static char* entry = "xlatMtlMain";
#else
  static char* entry = "main";
#endif

/*-- variants --------------------------------------------------------*/

enum sg_uniform_type _tg_to_uniform_type(int format) {
  switch (format) {
    case 0: return SG_UNIFORMTYPE_FLOAT;
    case 1: return SG_UNIFORMTYPE_FLOAT2;
    case 2: return SG_UNIFORMTYPE_FLOAT3;
    case 3: return SG_UNIFORMTYPE_FLOAT4;
    case 4: return SG_UNIFORMTYPE_MAT4;
    default: return SG_UNIFORMTYPE_INVALID;
  }
}

enum sg_primitive_type _sg_to_primitive_type(int primitive) {
  switch (primitive) {
    case 0: return SG_PRIMITIVETYPE_POINTS;
    case 1: return SG_PRIMITIVETYPE_LINES;
    case 2: return SG_PRIMITIVETYPE_LINE_STRIP;
    case 3: return SG_PRIMITIVETYPE_TRIANGLES;
    case 4: return SG_PRIMITIVETYPE_TRIANGLE_STRIP;
    default: return _SG_PRIMITIVETYPE_DEFAULT;
  }
}

enum sg_compare_func _sg_to_compare_func(int compare) {
  switch (compare) {
    case 0: return SG_COMPAREFUNC_NEVER;
    case 1: return SG_COMPAREFUNC_LESS;
    case 2: return SG_COMPAREFUNC_EQUAL;
    case 3: return SG_COMPAREFUNC_LESS_EQUAL;
    case 4: return SG_COMPAREFUNC_GREATER;
    case 5: return SG_COMPAREFUNC_NOT_EQUAL;
    case 6: return SG_COMPAREFUNC_GREATER_EQUAL;
    case 7: return SG_COMPAREFUNC_ALWAYS;
    case 8: return SG_COMPAREFUNC_LESS; // COMPARE_DEFAULT
    default: return _SG_COMPAREFUNC_DEFAULT;
  }
}

enum sg_stencil_op _sg_to_stencil_op(int op) {
  switch (op) {
    case 0: return SG_STENCILOP_KEEP;
    case 1: return SG_STENCILOP_ZERO;
    case 2: return SG_STENCILOP_REPLACE;
    case 3: return SG_STENCILOP_INCR_CLAMP;
    case 4: return SG_STENCILOP_DECR_CLAMP;
    case 5: return SG_STENCILOP_INVERT;
    case 6: return SG_STENCILOP_INCR_WRAP;
    case 7: return SG_STENCILOP_DECR_WRAP;
    default: return _SG_STENCILOP_DEFAULT;
  }
}

enum sg_blend_factor _sg_to_blend_factor(int blend) {
  switch (blend) {
    case 0: return SG_BLENDFACTOR_ZERO;
    case 1: return SG_BLENDFACTOR_ONE;
    case 2: return SG_BLENDFACTOR_SRC_COLOR;
    case 3: return SG_BLENDFACTOR_ONE_MINUS_SRC_COLOR;
    case 4: return SG_BLENDFACTOR_SRC_ALPHA;
    case 5: return SG_BLENDFACTOR_ONE_MINUS_SRC_ALPHA;
    case 6: return SG_BLENDFACTOR_DST_COLOR;
    case 7: return SG_BLENDFACTOR_ONE_MINUS_DST_COLOR;
    case 8: return SG_BLENDFACTOR_DST_ALPHA;
    case 9: return SG_BLENDFACTOR_ONE_MINUS_DST_ALPHA;
    case 10: return SG_BLENDFACTOR_SRC_ALPHA_SATURATED;
    case 11: return SG_BLENDFACTOR_BLEND_COLOR;
    case 12: return SG_BLENDFACTOR_ONE_MINUS_BLEND_COLOR;
    case 13: return SG_BLENDFACTOR_BLEND_ALPHA;
    case 14: return SG_BLENDFACTOR_ONE_MINUS_BLEND_ALPHA;
    default: return _SG_BLENDFACTOR_DEFAULT;
  }
}

enum sg_blend_op _sg_to_blend_op(int op) {
  switch (op) {
    case 0: return SG_BLENDOP_ADD;
    case 1: return SG_BLENDOP_SUBTRACT;
    case 2: return SG_BLENDOP_REVERSE_SUBTRACT;
    default: return _SG_BLENDOP_DEFAULT;
  }
}

enum sg_cull_mode _sg_to_cull_mode(int mode) {
  switch (mode) {
    case 0: return SG_CULLMODE_NONE;
    case 1: return SG_CULLMODE_FRONT;
    case 2: return SG_CULLMODE_BACK;
    case 3: return SG_CULLMODE_BACK; // Default
    default: return _SG_CULLMODE_DEFAULT;
  }
}

enum sg_face_winding _sg_to_face_winding(int mode) {
  switch (mode) {
    case 0: return SG_FACEWINDING_CCW;
    case 1: return SG_FACEWINDING_CW;
    default: return _SG_FACEWINDING_DEFAULT;
  }
}

/*-- uniforms --------------------------------------------------------*/

int _tg_sizeof_uniform(int uniform_format) {
  switch (uniform_format) {
    case 0: return sizeof(float);
    case 1: return 2 * sizeof(float);
    case 2: return 3 * sizeof(float);
    case 3: return 4 * sizeof(float);
    case 4: return 16 * sizeof(float);
    default: return 0;
  }
}

CAMLprim value tg_apply_uniforms(value stage, value ub_index, value uniforms) {
  CAMLparam3(stage, ub_index, uniforms);
  CAMLlocal1(uniform);

  int uniforms_size = Wosize_val(uniforms);
  int byte_size = 0;

  for (int i = 0; i < uniforms_size; i++) {
    uniform = Field(uniforms, i);
    assert(Is_block(uniform));
    byte_size += _tg_sizeof_uniform(Tag_val(uniform));
  }

  float* uniform_data = malloc(byte_size);
  int data_index = 0;

  for (int i = 0; i < uniforms_size; i++) {
    int tag = Tag_val(Field(uniforms, i));
    uniform = Field(Field(uniforms, i), 0);
    if (tag == 0) {
      uniform_data[data_index++] = (float) Double_val(uniform);
    } else {
      // NOTE: OCaml optimises the vector records to be stored as double arrays
      assert(Tag_val(uniform) == 254);
      int inner_size = tag == 4 ? 16 : tag + 1;
      for (int mat_i = 0; mat_i < inner_size; mat_i++) {
        uniform_data[data_index++] = (float) Double_field(uniform, mat_i);
      }
    }
  }

  sg_apply_uniforms(Int_val(stage), Int_val(ub_index), uniform_data, byte_size);
  free(uniform_data);

  CAMLreturn(Val_unit);
}

/*-- sg_buffer --------------------------------------------------------*/

void _tg_finalize_buffer(value v) {
  sg_buffer buffer = *(sg_buffer *) Data_custom_val(v);
  sg_destroy_buffer(buffer);
}

static struct custom_operations tg_buffer = {
  .identifier = "sg_buffer",
  .finalize = _tg_finalize_buffer,
  .compare = custom_compare_default,
  .hash = custom_hash_default,
  .serialize = custom_serialize_default,
  .deserialize = custom_deserialize_default,
};

static value _tg_copy_buffer(sg_buffer* buffer) {
  CAMLparam0();
  CAMLlocal1(val);

  val = caml_alloc_custom(&tg_buffer, sizeof(sg_buffer), 0, 1);
  memcpy(Data_custom_val(val), buffer, sizeof(sg_buffer));

  CAMLreturn(val);
}

CAMLprim value tg_make_vertex_buffer(value data) {
  CAMLparam1(data);
  CAMLlocal1(ret);

  sg_buffer buffer = sg_make_buffer(&(sg_buffer_desc){
    .type = SG_BUFFERTYPE_VERTEXBUFFER,
    .size = caml_ba_byte_size(Caml_ba_array_val(data)),
    .content = Caml_ba_data_val(data),
  });

  ret = _tg_copy_buffer(&buffer);
  CAMLreturn(ret);
}

CAMLprim value tg_make_index_buffer(value data) {
  CAMLparam1(data);
  CAMLlocal1(ret);

  sg_buffer buffer = sg_make_buffer(&(sg_buffer_desc){
    .type = SG_BUFFERTYPE_INDEXBUFFER,
    .size = caml_ba_byte_size(Caml_ba_array_val(data)),
    .content = Caml_ba_data_val(data),
  });

  ret = _tg_copy_buffer(&buffer);
  CAMLreturn(ret);
}

/*-- sg_shader --------------------------------------------------------*/

void _tg_finalize_shader(value v) {
  sg_shader shader = *(sg_shader *) Data_custom_val(v);
  sg_destroy_shader(shader);
}

static struct custom_operations tg_shader = {
  .identifier = "sg_shader",
  .finalize = _tg_finalize_shader,
  .compare = custom_compare_default,
  .hash = custom_hash_default,
  .serialize = custom_serialize_default,
  .deserialize = custom_deserialize_default,
};

static value _tg_copy_shader(sg_shader* shader) {
  CAMLparam0();
  CAMLlocal1(val);

  val = caml_alloc_custom(&tg_shader, sizeof(sg_shader), 0, 1);
  memcpy(Data_custom_val(val), shader, sizeof(sg_shader));
  CAMLreturn(val);
}

CAMLprim value tg_make_shader(value vs, value fs, value desc) {
  CAMLparam3(vs, fs, desc);
  CAMLlocal1(ret);

  sg_shader_desc shader_desc = {
    .vs = {
      .source = String_val(vs),
      .entry = entry,
    },
    .fs = {
      .source = String_val(fs),
      .entry = entry,
    },
  };

  if (desc != Val_none) {
    value attrs = Field(desc, 0);
    value textures = Field(desc, 1);
    value vs_uniforms = Field(desc, 2);
    value fs_uniforms = Field(desc, 3);

    int attrs_size = Wosize_val(attrs);
    for (int i = 0; i < attrs_size; i++) {
      shader_desc.attrs[i].name = String_val(Field(attrs, i));
    }

    int textures_size = Wosize_val(textures);
    for (int i = 0; i < textures_size; i++) {
      shader_desc.fs.images[i].name = String_val(Field(Field(attrs, i), 0));
      shader_desc.fs.images[i].type = Int_val(Field(Field(attrs, i), 1));
    }

    int vs_uniforms_size = Wosize_val(vs_uniforms);
    if (vs_uniforms_size != 0) {
      sg_shader_uniform_block_desc vs_block = { .size = 0 };
      for (int i = 0; i < vs_uniforms_size; i++) {
        value uniform = Field(vs_uniforms, i);
        int format = Int_val(Field(uniform, 1));
        vs_block.size += _tg_sizeof_uniform(format);
        vs_block.uniforms[i].type = _tg_to_uniform_type(format);
        vs_block.uniforms[i].name = String_val(Field(uniform, 0));
      }

      shader_desc.vs.uniform_blocks[0] = vs_block;
    }

    int fs_uniforms_size = Wosize_val(fs_uniforms);
    if (fs_uniforms_size != 0) {
      sg_shader_uniform_block_desc fs_block = { .size = 0 };
      for (int i = 0; i < fs_uniforms_size; i++) {
        value uniform = Field(fs_uniforms, i);
        int format = Int_val(Field(uniform, 1));
        fs_block.size += _tg_sizeof_uniform(format);
        fs_block.uniforms[i].type = _tg_to_uniform_type(format);
        fs_block.uniforms[i].name = String_val(Field(uniform, 0));
      }

      shader_desc.fs.uniform_blocks[0] = fs_block;
    }
  }

  sg_shader shader = sg_make_shader(&shader_desc);
  ret = _tg_copy_shader(&shader);
  CAMLreturn(ret);
}

/*-- sg_pipeline --------------------------------------------------------*/

void _tg_finalize_pipeline(value v) {
  sg_pipeline pipeline = *(sg_pipeline *) Data_custom_val(v);
  sg_destroy_pipeline(pipeline);
}

static struct custom_operations tg_pipeline = {
  .identifier = "sg_pipeline",
  .finalize = _tg_finalize_pipeline,
  .compare = custom_compare_default,
  .hash = custom_hash_default,
  .serialize = custom_serialize_default,
  .deserialize = custom_deserialize_default,
};

static value _tg_copy_pipeline(sg_pipeline* pipeline) {
  CAMLparam0();
  CAMLlocal1(val);

  val = caml_alloc_custom(&tg_pipeline, sizeof(sg_pipeline), 0, 1);
  memcpy(Data_custom_val(val), pipeline, sizeof(sg_pipeline));

  CAMLreturn(val);
}

static value _tg_pipeline_settings(sg_pipeline_desc* desc, value settings) {
  CAMLparam1(settings);

  int settings_size = Wosize_val(settings);
  for (int i = 0; i < settings_size; i++) {
    value setting = Field(settings, i);
    if (!Is_block(setting)) {
      if (Int_val(setting) == 0) desc->index_type = SG_INDEXTYPE_UINT16;
      continue;
    }

    switch (Tag_val(setting)) {
      case 0: /* Primitive */
        desc->primitive_type =
          _sg_to_primitive_type(Int_val(Field(setting, 0)));
        break;
      case 1: /* DepthComparison */
        desc->depth_stencil.depth_write_enabled = true;
        desc->depth_stencil.depth_compare_func =
          _sg_to_compare_func(Int_val(Field(setting, 0)));
        break;
      case 2: /* StencilFront */
        desc->depth_stencil.stencil_enabled = true;
        desc->depth_stencil.stencil_front.fail_op =
          _sg_to_stencil_op(Int_val(Field(setting, 0)));
        desc->depth_stencil.stencil_front.depth_fail_op =
          _sg_to_stencil_op(Int_val(Field(setting, 1)));
        desc->depth_stencil.stencil_front.pass_op =
          _sg_to_stencil_op(Int_val(Field(setting, 2)));
        desc->depth_stencil.stencil_front.compare_func =
          _sg_to_compare_func(Int_val(Field(setting, 3)));
        break;
      case 3: /* StencilBack */
        desc->depth_stencil.stencil_enabled = true;
        desc->depth_stencil.stencil_back.fail_op =
          _sg_to_stencil_op(Int_val(Field(setting, 0)));
        desc->depth_stencil.stencil_back.depth_fail_op =
          _sg_to_stencil_op(Int_val(Field(setting, 1)));
        desc->depth_stencil.stencil_back.pass_op =
          _sg_to_stencil_op(Int_val(Field(setting, 2)));
        desc->depth_stencil.stencil_back.compare_func =
          _sg_to_compare_func(Int_val(Field(setting, 3)));
        break;
      case 4: /* BlendColor */
        desc->blend.blend_color[0] = (float) Double_field(Field(setting, 0), 0);
        desc->blend.blend_color[1] = (float) Double_field(Field(setting, 0), 1);
        desc->blend.blend_color[2] = (float) Double_field(Field(setting, 0), 2);
        desc->blend.blend_color[3] = (float) Double_field(Field(setting, 0), 3);
        desc->blend.enabled = true;
        break;
      case 5: /* BlendModeRgb */
        desc->blend.enabled = true;
        desc->blend.src_factor_rgb = _sg_to_blend_factor(Int_val(Field(setting, 0)));
        desc->blend.dst_factor_rgb = _sg_to_blend_factor(Int_val(Field(setting, 1)));
        desc->blend.op_rgb = _sg_to_blend_op(Int_val(Field(setting, 2)));
        break;
      case 6: /* BlendModeAlpha */
        desc->blend.enabled = true;
        desc->blend.src_factor_alpha = _sg_to_blend_factor(Int_val(Field(setting, 0)));
        desc->blend.dst_factor_alpha = _sg_to_blend_factor(Int_val(Field(setting, 1)));
        desc->blend.op_alpha = _sg_to_blend_op(Int_val(Field(setting, 2)));
        break;
      case 7: /* CullMode */
        desc->rasterizer.cull_mode = _sg_to_cull_mode(Int_val(Field(setting, 0)));
        break;
      case 8: /* FaceWinding */
        desc->rasterizer.face_winding = _sg_to_face_winding(Int_val(Field(setting, 0)));
        break;
      case 9: /* DepthBias */
        desc->rasterizer.depth_bias = (float) Double_val(Field(setting, 0));
        desc->rasterizer.depth_bias_slope_scale = (float) Double_val(Field(setting, 1));
        desc->rasterizer.depth_bias_clamp = (float) Double_val(Field(setting, 2));
        break;
    }
  }

  CAMLreturn(Val_unit);
}

CAMLprim value tg_make_pipeline(value shader, value formats, value settings) {
  CAMLparam3(shader, formats, settings);
  CAMLlocal1(ret);

  sg_shader shader_val = *(sg_shader *) Data_custom_val(shader);

  sg_pipeline_desc pipeline_desc = {
    .shader = shader_val,
    // Apply defaults from WebGL
    .depth_stencil.depth_compare_func = SG_COMPAREFUNC_LESS,
    .rasterizer.face_winding = SG_FACEWINDING_CCW,
  };

  _tg_pipeline_settings(&pipeline_desc, settings);

  int formats_size = Wosize_val(formats);
  for (int i = 0; i < formats_size; i++) {
    value format = Field(formats, i);
    pipeline_desc.layout.attrs[i].buffer_index = Int_val(Field(format, 0));
    pipeline_desc.layout.attrs[i].format = Int_val(Field(format, 1));
  }

  sg_pipeline pipeline = sg_make_pipeline(&pipeline_desc);
  ret = _tg_copy_pipeline(&pipeline);
  CAMLreturn(ret);
}

/*-- main lifecycle --------------------------------------------------------*/

typedef struct {
  value v;
} tg_state;

static value* frame_callback = NULL;
static value* init_callback = NULL;

void _tg_init(void* data) {
  loadGraphics();

  sg_setup(&(sg_desc){
    .mtl_device = sapp_metal_get_device(),
    .mtl_renderpass_descriptor_cb = sapp_metal_get_renderpass_descriptor,
    .mtl_drawable_cb = sapp_metal_get_drawable,
    .d3d11_device = sapp_d3d11_get_device(),
    .d3d11_device_context = sapp_d3d11_get_device_context(),
    .d3d11_render_target_view_cb = sapp_d3d11_get_render_target_view,
    .d3d11_depth_stencil_view_cb = sapp_d3d11_get_depth_stencil_view,
  });

  stm_setup();

  if (init_callback != NULL) {
    tg_state* state = (tg_state*) data;
    state->v = caml_callback(*init_callback, Val_unit);
  }
}

void _tg_cleanup() {
  sg_shutdown();
}

void _tg_frame(void* data) {
  if (frame_callback != NULL) {
    tg_state* state = (tg_state*) data;
    state->v = caml_callback(*frame_callback, state->v);
  }
}

void _tg_event(const sapp_event* evt) {
  // TODO
}

void _tg_fail(const char* msg) {
  printf("2G Fatal Error: %s", msg);
}

void tg_start() {
  CAMLparam0();

  init_callback = caml_named_value("tg_init_cb");
  frame_callback = caml_named_value("tg_frame_cb");

  tg_state* state = malloc(sizeof(tg_state));

  sapp_run(&(sapp_desc){
    .user_data = state,
    .init_userdata_cb = _tg_init,
    .frame_userdata_cb = _tg_frame,
    .cleanup_cb = _tg_cleanup,
    .event_cb = _tg_event,
    .fail_cb = _tg_fail,
    .gl_force_gles2 = sapp_gles2(),
    .width = 800,
    .height = 600,
    .window_title = "Reason TG"
  });
}

/*-- stateful calls --------------------------------------------------------*/

CAMLprim value tg_begin_pass(value color, value clear) {
  CAMLparam2(color, clear);

  const float r = (float) Double_field(color, 0);
  const float g = (float) Double_field(color, 1);
  const float b = (float) Double_field(color, 2);
  const float a = (float) Double_field(color, 3);

  enum sg_action action_enum;
  if (Bool_val(clear)) {
    action_enum = SG_ACTION_CLEAR;
  } else {
    action_enum = SG_ACTION_LOAD;
  }

  sg_pass_action pass_action = {
    .colors[0] = {
      .action=action_enum,
      .val={ r, g, b, a },
    }
  };

  const int w = (int) sapp_width();
  const int h = (int) sapp_height();

  sg_begin_default_pass(&pass_action, w, h);

  CAMLreturn(Val_unit);
}

CAMLprim value tg_draw(value base_element, value num_elements, value num_instances) {
  CAMLparam3(base_element, num_elements, num_instances);
  sg_draw(Int_val(base_element), Int_val(num_elements), Int_val(num_instances));
  CAMLreturn(Val_unit);
}

CAMLprim value tg_end_pass() {
  CAMLparam0();
  sg_end_pass();
  CAMLreturn(Val_unit);
}

CAMLprim value tg_commit() {
  CAMLparam0();
  sg_commit();
  CAMLreturn(Val_unit);
}

CAMLprim value tg_apply_pipeline(value pipeline) {
  CAMLparam1(pipeline);
  sg_pipeline pipeline_val = *(sg_pipeline *) Data_custom_val(pipeline);
  sg_apply_pipeline(pipeline_val);
  CAMLreturn(Val_unit);
}

CAMLprim value tg_apply_buffers(value index_buffer, value buffers) {
  CAMLparam2(index_buffer, buffers);

  sg_bindings bindings = {};

  int vb_size = Wosize_val(buffers);
  for (int i = 0; i < vb_size; i++) {
    bindings.vertex_buffers[i] = *(sg_buffer *) Data_custom_val(Field(buffers, i));
  }

  if (index_buffer != Val_none) {
    bindings.index_buffer = *(sg_buffer *) Data_custom_val(index_buffer);
  }

  sg_apply_bindings(&bindings);

  CAMLreturn(Val_unit);
}

/*-- stateless calls --------------------------------------------------------*/

CAMLprim value tg_now() {
  CAMLparam0();
  CAMLlocal1(now);
  now = caml_copy_double(stm_ms(stm_now()));
  CAMLreturn(now);
}
