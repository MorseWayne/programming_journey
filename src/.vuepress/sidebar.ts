import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/docs/platform_engineering/": [
    {
      "text": "课程导学",
      "children": [
        "",
        "curriculum/",
        "curriculum/learning_path",
        "curriculum/im_reference",
        "curriculum/source_review",
        "curriculum/assessment",
        "study_guide",
        "business_map",
        "concept_map",
        "environment"
      ]
    },
    {
      "text": "入门与衔接 · 35 课",
      "collapsible": true,
      "children": [
        {
          "text": "A · Go 编程入门",
          "collapsible": true,
          "children": [
            "beginner/",
            "beginner/01_first_program",
            "beginner/02_values_types",
            "beginner/03_control_flow",
            "beginner/04_functions",
            "beginner/05_collections",
            "beginner/06_structs_pointers",
            "beginner/07_interfaces_errors",
            "beginner/08_packages_modules",
            "beginner/09_testing",
            "beginner/10_files_json"
          ]
        },
        {
          "text": "B · 后端开发基础",
          "collapsible": true,
          "children": [
            "backend_basics/",
            "00_system_model",
            "backend_basics/02_network",
            "backend_basics/03_http",
            "backend_basics/04_local_tools",
            "backend_basics/05_sql",
            "backend_basics/06_goroutines_mutex",
            "backend_basics/07_channels_context"
          ]
        },
        {
          "text": "C · 从单服务到可靠平台",
          "collapsible": true,
          "children": [
            {
              "text": "C01–C02：状态、契约与所有权",
              "collapsible": true,
              "children": [
                "stages/01_foundations",
                "01_contracts",
                "02_ownership"
              ]
            },
            {
              "text": "C03–C04：并发、网络与性能",
              "collapsible": true,
              "children": [
                "stages/02_concurrency",
                "03_concurrency",
                "04_performance"
              ]
            },
            {
              "text": "C05–C07：持久化与数据正确性",
              "collapsible": true,
              "children": [
                "stages/03_data",
                "05_storage",
                "06_transactions",
                "07_cache_recovery"
              ]
            },
            {
              "text": "C08–C09：跨服务与状态归属",
              "collapsible": true,
              "children": [
                "stages/04_distributed",
                "08_rpc_messages",
                "09_distributed_state"
              ]
            },
            {
              "text": "C10–C12：平台运行与演进",
              "collapsible": true,
              "children": [
                "stages/05_platform",
                "10_observability",
                "11_delivery",
                "12_platform_design"
              ]
            }
          ]
        },
        {
          "text": "D · 综合实践与 AI 方向",
          "collapsible": true,
          "children": [
            {
              "text": "D05–D06：业务方案与综合实践",
              "collapsible": true,
              "children": [
                "stages/07_capstone",
                "17_architecture",
                "18_capstone"
              ]
            },
            {
              "text": "D01–D04：AI 方向扩展",
              "collapsible": true,
              "children": [
                "stages/06_ai",
                "13_python",
                "14_rag",
                "15_agents",
                "16_evaluation"
              ]
            }
          ]
        }
      ]
    },
    {
      "text": "专业分卷 · 理论与工程",
      "collapsible": true,
      "children": [
        {
          "text": "01 · Go 语言、标准库与程序设计",
          "collapsible": true,
          "children": [
            "curriculum/01_go/",
            "curriculum/01_go/01_program_toolchain",
            "curriculum/01_go/02_types_data",
            "curriculum/01_go/03_control_functions",
            "curriculum/01_go/04_collections_text",
            "curriculum/01_go/05_maps_structs_pointers",
            "curriculum/01_go/06_methods_interfaces",
            "curriculum/01_go/07_errors_resources",
            "curriculum/01_go/08_standard_library",
            "curriculum/01_go/09_packages_evolution",
            "curriculum/01_go/12_cli_capstone",
            "curriculum/01_go/core"
          ]
        },
        {
          "text": "02 · 数学基础、数据结构与问题求解",
          "collapsible": true,
          "children": [
            "curriculum/02_algorithms/",
            "curriculum/02_algorithms/01_discrete_cost",
            "curriculum/02_algorithms/02_linear_structures",
            "curriculum/02_algorithms/03_search_invariants",
            "curriculum/02_algorithms/04_hash_sets",
            "curriculum/02_algorithms/05_sort_divide",
            "curriculum/02_algorithms/core"
          ]
        },
        {
          "text": "03 · 计算机系统、操作系统与 Linux",
          "collapsible": true,
          "children": [
            "curriculum/03_systems/",
            "curriculum/03_systems/01_data_instructions_storage",
            "curriculum/03_systems/02_process_syscalls",
            "curriculum/03_systems/03_linux_process_resources",
            "curriculum/03_systems/04_cpu_scheduling",
            "curriculum/03_systems/core"
          ]
        },
        {
          "text": "04 · 网络协议与网络编程",
          "collapsible": true,
          "children": [
            "curriculum/04_networks/",
            "curriculum/04_networks/01_application_communication_layers",
            "curriculum/04_networks/02_addresses_names_routes",
            "curriculum/04_networks/03_http_websocket_basics",
            "curriculum/04_networks/04_reliable_transport",
            "curriculum/04_networks/core"
          ]
        },
        {
          "text": "05 · Go 并发、运行时与内存管理",
          "collapsible": true,
          "children": [
            "curriculum/05_runtime/",
            "curriculum/05_runtime/01_concurrent_tasks_lifecycle",
            "curriculum/05_runtime/02_sync_primitives",
            "curriculum/05_runtime/03_channels_cancellation",
            "curriculum/05_runtime/core"
          ]
        },
        {
          "text": "06 · 数据库、消息存储与查询执行",
          "collapsible": true,
          "children": [
            "curriculum/06_databases/",
            "curriculum/06_databases/01_relational_identity",
            "curriculum/06_databases/02_sql_queries",
            "curriculum/06_databases/03_schema_evolution",
            "curriculum/06_databases/07_transactions_anomalies",
            "curriculum/06_databases/10_go_data_access",
            "curriculum/06_databases/core"
          ]
        },
        {
          "text": "07 · 缓存、消息队列与数据流",
          "collapsible": true,
          "children": [
            "curriculum/07_cache_messaging/",
            "curriculum/07_cache_messaging/core"
          ]
        },
        {
          "text": "08 · 分布式系统、一致性与故障恢复",
          "collapsible": true,
          "children": [
            "curriculum/08_distributed/",
            "curriculum/08_distributed/core"
          ]
        },
        {
          "text": "09 · Go 后端应用、API 与应用安全",
          "collapsible": true,
          "children": [
            "curriculum/09_backend_security/",
            "curriculum/09_backend_security/01_requirements_boundaries",
            "curriculum/09_backend_security/02_http_api_contract",
            "curriculum/09_backend_security/03_program_organization",
            "curriculum/09_backend_security/04_request_pipeline",
            "curriculum/09_backend_security/05_data_access_migration",
            "curriculum/09_backend_security/06_browser_client_boundary",
            "curriculum/09_backend_security/07_authentication_authorization",
            "curriculum/09_backend_security/08_input_output_defense",
            "curriculum/09_backend_security/11_application_tests_delivery",
            "curriculum/09_backend_security/core"
          ]
        },
        {
          "text": "10 · 测试、Git、代码质量与团队交付",
          "collapsible": true,
          "children": [
            "curriculum/10_engineering/",
            "curriculum/10_engineering/01_verifiable_requirements",
            "curriculum/10_engineering/02_testing_basics",
            "curriculum/10_engineering/03_git_state",
            "curriculum/10_engineering/04_test_doubles_design",
            "curriculum/10_engineering/05_refactoring_boundaries",
            "curriculum/10_engineering/06_code_review_merge",
            "curriculum/10_engineering/09_ci_artifacts",
            "curriculum/10_engineering/core"
          ]
        },
        {
          "text": "11 · 性能工程、可观测性与可靠性",
          "collapsible": true,
          "children": [
            "curriculum/11_reliability/",
            "curriculum/11_reliability/01_business_measurement",
            "curriculum/11_reliability/02_distributions_statistics",
            "curriculum/11_reliability/03_logs_metrics_traces",
            "curriculum/11_reliability/core"
          ]
        },
        {
          "text": "12 · 容器、Kubernetes 与平台运行",
          "collapsible": true,
          "children": [
            "curriculum/12_platform/",
            "curriculum/12_platform/core"
          ]
        },
        {
          "text": "13 · 软件设计、架构决策与高级工程实践",
          "collapsible": true,
          "children": [
            "curriculum/13_architecture/",
            "curriculum/13_architecture/core"
          ]
        },
        {
          "text": "14 · AI 基础、检索、Agent 与应用评测",
          "collapsible": true,
          "children": [
            "curriculum/14_ai/",
            "curriculum/14_ai/core"
          ]
        }
      ]
    },
    {
      "text": "复习与资料",
      "collapsible": true,
      "children": [
        "progress",
        "references",
        "teaching_research",
        "verification"
      ]
    }
  ],
  "/docs/ai/": "structure",
  "/docs/cs_basics/": "structure",
  "/docs/database/": "structure",
  "/docs/interview/": "structure",
  "/docs/language/": "structure",
  "/docs/middleware/": "structure",
  "/docs/personal/": "structure",
  "/docs/projects/": "structure",
  "/docs/tools/": "structure",
  "/docs/web_server/": "structure",
  "/article/": false,
  "/category/": false,
  "/docs/": false,
  "/star/": false,
  "/tag/": false,
  "/timeline/": false,
});
