# app.R
# Shiny dashboard for the Smart Urban Parking Intelligence project.
# R equivalent of dashboard/app.py -- same five views (Overview, Live
# Monitoring, Historical Analytics, Prediction, Map).
#
# Run (from the project root):
#   R -e "shiny::runApp('r-analytics/shiny_dashboard')"
#
# Requires: shiny, plotly, leaflet, dplyr (see r-analytics/install_packages.R)

suppressMessages({
  library(shiny)
  library(plotly)
  library(leaflet)
  library(dplyr)
})

# Paths are relative to the project root, two levels up from this app's
# own folder (r-analytics/shiny_dashboard/) -- runApp() sets the working
# directory to the app's folder, so we resolve an absolute base here.
DATA_DIR <- normalizePath(file.path(getwd(), "..", "..", "data"), mustWork = FALSE)
if (!dir.exists(DATA_DIR)) {
  # Fallback: app launched with the project root already as the working directory.
  DATA_DIR <- normalizePath("data", mustWork = FALSE)
}

load_data <- function() {
  predictions_path <- file.path(DATA_DIR, "processed", "predictions_r.csv")
  if (!file.exists(predictions_path)) {
    predictions_path <- file.path(DATA_DIR, "processed", "predictions.csv")
  }

  list(
    dashboard = read.csv(file.path(DATA_DIR, "processed", "dashboard_data.csv"), stringsAsFactors = FALSE),
    trend = read.csv(file.path(DATA_DIR, "processed", "occupancy_trend.csv"), stringsAsFactors = FALSE),
    predictions = read.csv(predictions_path, stringsAsFactors = FALSE),
    zones = read.csv(file.path(DATA_DIR, "raw", "zones.csv"), stringsAsFactors = FALSE)
  )
}

ui <- fluidPage(
  titlePanel("\U0001F697 Smart Urban Parking Intelligence (R / Shiny)"),
  tabsetPanel(
    tabPanel(
      "Overview",
      fluidRow(
        column(3, wellPanel(h4("Total Capacity"), textOutput("kpi_capacity"))),
        column(3, wellPanel(h4("Occupied"), textOutput("kpi_occupied"))),
        column(3, wellPanel(h4("Available"), textOutput("kpi_available"))),
        column(3, wellPanel(h4("Utilization"), textOutput("kpi_utilization")))
      ),
      plotlyOutput("zone_bar_chart")
    ),
    tabPanel(
      "Live Monitoring",
      br(),
      uiOutput("live_status")
    ),
    tabPanel(
      "Historical Analytics",
      plotlyOutput("trend_chart"),
      plotlyOutput("peak_hour_chart")
    ),
    tabPanel(
      "Prediction",
      br(),
      selectInput("selected_zone", "Select a zone", choices = NULL),
      fluidRow(
        column(4, wellPanel(h4("Current Occupancy"), textOutput("pred_current"))),
        column(4, wellPanel(h4("Predicted (30 min)"), textOutput("pred_future"))),
        column(4, wellPanel(h4("Risk Level"), textOutput("pred_risk")))
      ),
      plotlyOutput("prediction_chart")
    ),
    tabPanel(
      "Map",
      br(),
      leafletOutput("zone_map", height = 550)
    )
  )
)

server <- function(input, output, session) {
  app_data <- reactiveVal(load_data())

  dashboard_data <- reactive({
    d <- app_data()$dashboard
    zones <- app_data()$zones
    merge(d, zones[, c("zone_id", "zone_name", "latitude", "longitude")], by = "zone_id")
  })

  observe({
    updateSelectInput(session, "selected_zone", choices = sort(unique(app_data()$predictions$zone_id)))
  })

  output$kpi_capacity <- renderText({ format(sum(dashboard_data()$capacity), big.mark = ",") })
  output$kpi_occupied <- renderText({ format(round(sum(dashboard_data()$occupancy)), big.mark = ",") })
  output$kpi_available <- renderText({
    format(round(sum(dashboard_data()$capacity) - sum(dashboard_data()$occupancy)), big.mark = ",")
  })
  output$kpi_utilization <- renderText({
    d <- dashboard_data()
    sprintf("%.1f%%", sum(d$occupancy) / sum(d$capacity) * 100)
  })

  output$zone_bar_chart <- renderPlotly({
    # "RdYlGn" isn't one of plotly.js's built-in named colorscales, so we
    # spell out a simple green (low utilization) -> red (high) gradient.
    d <- dashboard_data() %>% arrange(desc(utilization))
    util_colorscale <- list(list(0, "#31a354"), list(0.5, "#feb24c"), list(1, "#de2d26"))
    plot_ly(
      d, x = ~zone_id, y = ~occupancy, type = "bar",
      marker = list(color = ~utilization, colorscale = util_colorscale, cmin = 0, cmax = 100)
    ) %>%
      layout(title = "Current Parking Occupancy by Zone", yaxis = list(title = "Occupancy"))
  })

  output$live_status <- renderUI({
    d <- dashboard_data() %>% arrange(desc(utilization))
    tagList(lapply(seq_len(nrow(d)), function(i) {
      row <- d[i, ]
      icon <- if (row$utilization >= 90) "\U0001F534" else if (row$utilization >= 70) "\U0001F7E1" else "\U0001F7E2"
      fillpct <- min(row$utilization, 100)
      fluidRow(
        style = "margin-bottom: 6px;",
        column(2, strong(row$zone_id)),
        column(7, tags$div(
          style = "background:#eee;border-radius:4px;overflow:hidden;",
          tags$div(
            style = sprintf(
              "width:%.0f%%;background:#2c7fb8;color:white;padding:4px 8px;white-space:nowrap;",
              fillpct
            ),
            row$zone_name
          )
        )),
        column(3, sprintf("%s %.0f%%", icon, row$utilization))
      )
    }))
  })

  output$trend_chart <- renderPlotly({
    t <- app_data()$trend
    t$timestamp <- as.POSIXct(t$timestamp)
    plot_ly(t, x = ~timestamp, y = ~occupancy, color = ~zone_id, type = "scatter", mode = "lines") %>%
      layout(title = "Parking Occupancy Over Time (last 7 days)")
  })

  output$peak_hour_chart <- renderPlotly({
    t <- app_data()$trend
    t$hour <- as.integer(format(as.POSIXct(t$timestamp), "%H"))
    peak <- t %>% group_by(hour) %>% summarise(occupancy = mean(occupancy), .groups = "drop")
    plot_ly(peak, x = ~hour, y = ~occupancy, type = "bar") %>%
      layout(title = "Average Occupancy by Hour of Day")
  })

  zone_predictions <- reactive({
    req(input$selected_zone)
    p <- app_data()$predictions %>% filter(zone_id == input$selected_zone)
    p$timestamp <- as.POSIXct(p$timestamp)
    p %>% arrange(timestamp)
  })

  output$pred_current <- renderText({
    last <- tail(zone_predictions(), 1)
    sprintf("%.0f/%.0f", last$current_occupancy, last$capacity)
  })
  output$pred_future <- renderText({
    last <- tail(zone_predictions(), 1)
    sprintf("%.0f/%.0f", last$predicted_occupancy, last$capacity)
  })
  output$pred_risk <- renderText({
    tail(zone_predictions(), 1)$risk_level
  })

  output$prediction_chart <- renderPlotly({
    z <- zone_predictions()
    plot_ly(z, x = ~timestamp) %>%
      add_lines(y = ~current_occupancy, name = "Current") %>%
      add_lines(y = ~predicted_occupancy, name = "Predicted") %>%
      layout(title = paste("Current vs Predicted \u2014", input$selected_zone))
  })

  output$zone_map <- renderLeaflet({
    d <- dashboard_data()
    pal <- colorNumeric("RdYlGn", domain = c(0, 100), reverse = TRUE)
    leaflet(d) %>%
      addTiles() %>%
      addCircleMarkers(
        lng = ~longitude, lat = ~latitude,
        radius = ~sqrt(capacity),
        color = ~pal(utilization),
        stroke = FALSE, fillOpacity = 0.8,
        popup = ~sprintf(
          "%s<br/>Occupancy: %.0f/%.0f (%.0f%%)",
          zone_name, occupancy, capacity, utilization
        )
      )
  })
}

shinyApp(ui, server)
