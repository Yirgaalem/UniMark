cmake_minimum_required(VERSION 3.13)

project(appmodules)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# On Windows, make the Android C++ runtime dependency explicit for the app module.
target_link_libraries(${CMAKE_PROJECT_NAME} c++_shared)

# React Native builds codegen and autolinked packages as separate shared libraries.
if(DEFINED APP_CODEGEN_TARGET AND TARGET ${APP_CODEGEN_TARGET})
  target_link_libraries(${APP_CODEGEN_TARGET} c++_shared)
endif()

if(DEFINED AUTOLINKED_LIBRARIES)
  foreach(autolinked_library ${AUTOLINKED_LIBRARIES})
    target_link_libraries(${autolinked_library} c++_shared)
  endforeach()
endif()
