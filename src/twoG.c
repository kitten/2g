#include <stdio.h>
#include <string.h>

#include <caml/custom.h>
#include <caml/callback.h>
#include <caml/memory.h>
#include <caml/mlvalues.h>
#include <caml/bigarray.h>

#include "sokol/sokol.h"
#include "shaders/basic.h"

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

CAMLprim value tg_make_buffer(value data) {
  CAMLparam1(data);
  CAMLlocal1(ret);

  sg_buffer buffer = sg_make_buffer(&(sg_buffer_desc){
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

CAMLprim value tg_make_shader(value vs, value fs) {
  CAMLparam2(vs, fs);
  CAMLlocal1(ret);

  sg_shader shader = sg_make_shader(&(sg_shader_desc){
    .vs.source = String_val(vs),
    .fs.source = String_val(fs),
  });

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

CAMLprim value tg_make_pipeline(value shader) {
  CAMLparam1(shader);
  CAMLlocal1(ret);

  sg_shader shader_val = *(sg_shader *) Data_custom_val(shader);
  sg_pipeline pipeline = sg_make_pipeline(&(sg_pipeline_desc){
    .shader = shader_val,
    .layout = {
      .attrs = {
        [0].format=SG_VERTEXFORMAT_FLOAT3,
        [1].format=SG_VERTEXFORMAT_FLOAT4
      }
    }
  });

  ret = _tg_copy_pipeline(&pipeline);
  CAMLreturn(ret);
}

/*-- sg_bindings --------------------------------------------------------*/

static struct custom_operations tg_bindings = {
  .identifier = "sg_bindings",
  .finalize = custom_finalize_default,
  .compare = custom_compare_default,
  .hash = custom_hash_default,
  .serialize = custom_serialize_default,
  .deserialize = custom_deserialize_default,
};

CAMLprim value tg_make_bindings(value buffer) {
  CAMLparam1(buffer);
  CAMLlocal1(ret);

  sg_bindings* bindings = (&(sg_bindings){
    .vertex_buffers[0] = *(sg_buffer *) Data_custom_val(buffer),
  });

  ret = caml_alloc_custom(&tg_pipeline, sizeof(sg_bindings), 0, 1);
  memcpy(Data_custom_val(ret), bindings, sizeof(sg_bindings));
  CAMLreturn(ret);
}

/*-- built-in shaders --------------------------------------------------------*/

CAMLprim value tg_basic_pipeline() {
  CAMLparam0();
  CAMLlocal1(ret);

  sg_shader shader = sg_make_shader(basic_shader_desc());
  sg_pipeline pipeline = sg_make_pipeline(&(sg_pipeline_desc){
    .shader = shader,
    .layout = {
      .attrs = {
        [ATTR_vs_position].format=SG_VERTEXFORMAT_FLOAT3,
        [ATTR_vs_color].format=SG_VERTEXFORMAT_FLOAT4
      }
    }
  });

  ret = _tg_copy_pipeline(&pipeline);
  CAMLreturn(ret);
}

/*-- main lifecycle --------------------------------------------------------*/

typedef struct {
  value v;
} tg_state;

static value* frame_callback = NULL;
static value* init_callback = NULL;
static value* user_state = NULL;

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
  printf("TG Fatal Error: %s", msg);
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

void tg_begin_pass() {
  CAMLparam0();

  sg_pass_action pass_action = {
    .colors[0] = {
      .action=SG_ACTION_CLEAR,
      .val={ 0.2f, 0.2f, 0.2f, 1.0f },
    }
  };

  const float w = (float) sapp_width();
  const float h = (float) sapp_height();

  sg_begin_default_pass(&pass_action, (int)w, (int)h);
}

void tg_draw(value base_element, value num_elements, value num_instances) {
  CAMLparam3(base_element, num_elements, num_instances);
  sg_draw(Int_val(base_element), Int_val(num_elements), Int_val(num_instances));
}

void tg_end_pass() {
  CAMLparam0();
  sg_end_pass();
}

void tg_commit() {
  CAMLparam0();
  sg_commit();
}

void tg_apply_pipeline(value pipeline) {
  CAMLparam1(pipeline);
  sg_pipeline pipeline_val = *(sg_pipeline *) Data_custom_val(pipeline);
  sg_apply_pipeline(pipeline_val);
}

void tg_apply_bindings(value bindings) {
  CAMLparam1(bindings);
  sg_apply_bindings((sg_bindings *) Data_custom_val(bindings));
}

void tg_apply_vertex_buffer(value buffer) {
  CAMLparam1(buffer);

  sg_buffer buffer_val = *(sg_buffer *) Data_custom_val(buffer);
  sg_bindings bindings = { .vertex_buffers[0] = buffer_val };

  sg_apply_bindings(&bindings);
}
