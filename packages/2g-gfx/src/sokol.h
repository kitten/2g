#pragma once

#define SOKOL_NO_ENTRY
#define SOKOL_NO_DEPRECATED

#if defined(__APPLE__)
  #include <TargetConditionals.h>
  #define SOKOL_METAL
#else
  #define SOKOL_GLCORE33
#endif

#if defined(SOKOL_GLCORE33)||defined(SOKOL_GLES2)||defined(SOKOL_GLES3)
  #include "glad/glad.h"
#endif

#include "sokol/sokol_gfx.h"
#include "sokol/sokol_app.h"
#include "sokol/sokol_time.h"

void loadGraphics(void);
